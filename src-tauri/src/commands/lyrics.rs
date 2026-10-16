//! Lyrics of a song (P13.3, R9): read in Rust from the song's folder or tags (D13). The
//! lyrics jobs (P24.5, D61): "Fetch lyrics" and the automatic fetch for the playing and the
//! next song share one registry and one worker, so one chain runs per song.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::SystemTime;

use clawdio_core::api::{IpcError, JobProgress, Lyrics};
use clawdio_core::net::lyrics::{self as online_lyrics, LyricsQuery};
use clawdio_core::net::{CancellationToken, NetError, OnlineGate};
use clawdio_core::sidecar;
use tauri::async_runtime::{channel, Sender};
use tauri::{AppHandle, Manager, Runtime};

use super::CommandResult;
use crate::events::{emit, JOB_PROGRESS, LYRICS_CHANGED, STATUS_MESSAGE};
use crate::online::Online;
use crate::state::{Library, LyricsState, MusicRoot};

/// The status line job id of "Fetch lyrics".
pub const LYRICS_JOB: &str = "lyrics";

/// The lyrics of a track, or None when it has no source or is not in the library.
fn read<R: Runtime>(app: &AppHandle<R>, track: u32) -> Option<Lyrics> {
    // One lock at a time: the player's resolver takes these two in the other order.
    let rel_path = app
        .state::<Library>()
        .0
        .read()
        .ok()?
        .rel_path(track)?
        .to_owned();
    let path = app
        .state::<MusicRoot>()
        .0
        .read()
        .ok()?
        .as_ref()?
        .join(rel_path);
    clawdio_core::lyrics::load(&path)
}

/// The lyrics of a track, or null when no source exists (the widget then offers "Fetch
/// lyrics"). Async, so the file and tag reads stay off the main thread.
#[tauri::command]
pub async fn lyrics_get(app: AppHandle, track: u32) -> CommandResult<Option<Lyrics>> {
    Ok(get(&app, track))
}

fn get<R: Runtime>(app: &AppHandle<R>, track: u32) -> Option<Lyrics> {
    let lyrics = read(app, track);
    // Only the playing song's lyrics count for the scan check: a late answer for the song
    // before must not replace them.
    let state = app.state::<LyricsState>();
    let playing = state.song.lock().is_ok_and(|song| *song == Some(track));
    if let (true, Ok(mut served)) = (playing, state.served.lock()) {
        *served = Some((track, lyrics.clone()));
    }
    lyrics
}

fn fetch_error(message: impl Into<String>) -> IpcError {
    IpcError {
        code: "lyrics_fetch".into(),
        message: message.into(),
    }
}

fn progress<R: Runtime>(app: &AppHandle<R>, text: Option<&str>) {
    emit(
        app,
        JOB_PROGRESS,
        JobProgress {
            id: LYRICS_JOB.into(),
            text: text.map(str::to_owned),
            cancelable: true,
        },
    );
}

/// How one lyrics job ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Saved,
    /// Every source gave no result (R9.3): the marker or the result in memory is set.
    NoMatch,
    /// Canceled, or Online lookups went off.
    Canceled,
    /// The job did not run: lyrics exist, a marker, a read-only folder, or the switches are
    /// off. The text is for the manual request.
    Skipped(String),
    /// An error; no marker (R9.3).
    Failed(String),
}

/// A running job: its token, and whether a manual request joined it (D61).
struct Running {
    token: CancellationToken,
    manual: bool,
}

/// Every running or queued lyrics job, keyed by track (D61), and the songs the automatic fetch
/// works for.
#[derive(Default)]
pub struct Registry {
    /// Queued automatic jobs, at most two: the playing song first, then the next song.
    auto: Vec<u32>,
    /// Queued jobs a manual request joined. They survive a song change.
    joined: Vec<u32>,
    running: HashMap<u32, Running>,
    /// Manual requests that wait for the job of a track.
    waiters: HashMap<u32, Vec<Sender<Outcome>>>,
    /// The playing and the next song as the player reported them (None while stopped).
    targets: (Option<u32>, Option<u32>),
    /// The player's play count of `targets.0`: a restart of the same song is a new play, so
    /// an error before is tried again (requirements section 5).
    play: u64,
    /// The songs jobs were queued for; reset while the rule is off, so turning it on queues
    /// both again.
    applied: (Option<u32>, Option<u32>),
    applied_play: u64,
    /// Songs outside an album folder with no match in this app run (D60).
    no_match: HashSet<u32>,
    /// The worker task runs.
    worker: bool,
    /// Goes up at each music folder change, so a "Fetch lyrics" that started before it does
    /// not touch either folder after it (P24.5).
    generation: u64,
}

impl Registry {
    /// The track has a live job: queued, or running with a token that is not canceled. A
    /// canceled job still ends, but a new one may queue behind it.
    fn known(&self, track: u32) -> bool {
        self.running
            .get(&track)
            .is_some_and(|job| !job.token.is_cancelled())
            || self.auto.contains(&track)
            || self.joined.contains(&track)
    }

    /// The player reported new songs, or the rule turned on (`enabled`). Queues the playing
    /// and the next song when each is new; drops queued automatic jobs for other songs. A
    /// running job continues (requirements section 5). True when a job was queued.
    fn retarget(&mut self, enabled: bool) -> bool {
        if !enabled {
            self.applied = (None, None);
            self.auto.clear();
            return false;
        }
        let (playing, next) = self.targets;
        let (old_playing, old_next) = self.applied;
        let new_play = self.play != self.applied_play;
        self.applied = self.targets;
        self.applied_play = self.play;
        self.auto
            .retain(|track| Some(*track) == playing || Some(*track) == next);
        let mut queued = false;
        let mut want = Vec::new();
        if playing.is_some() && (playing != old_playing || new_play) {
            want.extend(playing);
        }
        if next.is_some() && next != old_next && next != playing {
            want.extend(next);
        }
        for track in want {
            if !self.known(track) {
                self.auto.push(track);
                queued = true;
            }
        }
        // The playing song first.
        self.auto.sort_by_key(|track| Some(*track) != playing);
        queued
    }

    /// The next job to run: joined jobs first (a person waits), then the automatic ones.
    fn take(&mut self) -> Option<(u32, bool)> {
        if !self.joined.is_empty() {
            return Some((self.joined.remove(0), true));
        }
        (!self.auto.is_empty()).then(|| (self.auto.remove(0), false))
    }

    /// The running job of `track` ended. Waiters of a job queued again for the same track
    /// wait for that job.
    fn finish(&mut self, track: u32, outcome: &Outcome) {
        self.running.remove(&track);
        if self.auto.contains(&track) || self.joined.contains(&track) {
            return;
        }
        for waiter in self.waiters.remove(&track).unwrap_or_default() {
            let _ = waiter.try_send(outcome.clone());
        }
    }

    /// Answers every waiting manual request with "canceled" (R7: switch-off, Cancel, a new
    /// music folder). A later job for the same track has no waiter.
    fn cancel_waiters(&mut self) {
        for waiter in self.waiters.drain().flat_map(|(_, waiters)| waiters) {
            let _ = waiter.try_send(Outcome::Canceled);
        }
    }

    /// Takes every queued job, automatic and joined.
    fn all_queued(&mut self) -> Vec<u32> {
        let mut queued: Vec<u32> = self.auto.drain(..).collect();
        queued.append(&mut self.joined);
        queued
    }

    /// Ends the queued jobs and tells their waiters.
    fn drop_queued(&mut self, tracks: Vec<u32>) {
        for track in tracks {
            if !self.running.contains_key(&track) {
                self.finish(track, &Outcome::Canceled);
            }
        }
    }
}

/// The automatic fetch may run: Online lookups and "Fetch lyrics automatically" are on.
fn auto_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    let on = app
        .try_state::<Online>()
        .is_some_and(|online| online.gate.is_on());
    on && app.state::<LyricsState>().auto_on.load(Ordering::SeqCst)
}

/// The player reported the playing and the next song (P24.5): the playing song and then the
/// next song are queued when the rule holds. Stopped reports none.
pub fn targets<R: Runtime>(app: &AppHandle<R>, playing: Option<u32>, next: Option<u32>, play: u64) {
    let enabled = auto_enabled(app);
    let Some(state) = app.try_state::<LyricsState>() else {
        return;
    };
    let Ok(mut jobs) = state.jobs.lock() else {
        return;
    };
    let same = jobs.targets == (playing, next) && jobs.play == play;
    if same && ((jobs.applied == jobs.targets && jobs.applied_play == play) || !enabled) {
        return;
    }
    jobs.targets = (playing, next);
    jobs.play = play;
    if jobs.retarget(enabled) {
        start_worker(app, &mut jobs);
    }
}

/// Online lookups, "Fetch lyrics automatically" or the notice answer changed (D61, D64).
/// Off cancels: Online lookups off cancels every job (R7); the setting off cancels the jobs no
/// manual request joined. On queues the playing and the next song. `again` queues them also
/// when the rule did not change (the D64 "Keep on" answer).
pub fn rules_changed<R: Runtime>(app: &AppHandle<R>, again: bool) {
    let gate = app.try_state::<Online>().map(|online| online.gate.clone());
    let on = gate.as_ref().is_some_and(|gate| gate.is_on());
    let enabled = auto_enabled(app);
    let state = app.state::<LyricsState>();
    {
        let Ok(mut jobs) = state.jobs.lock() else {
            return;
        };
        if !on {
            let queued = jobs.all_queued();
            jobs.drop_queued(queued);
            for job in jobs.running.values() {
                job.token.cancel();
            }
            jobs.cancel_waiters();
        } else if !enabled {
            let queued: Vec<u32> = jobs.auto.drain(..).collect();
            jobs.drop_queued(queued);
            for job in jobs.running.values().filter(|job| !job.manual) {
                job.token.cancel();
            }
        }
        if again {
            jobs.applied = (None, None);
        }
        if jobs.retarget(enabled) {
            start_worker(app, &mut jobs);
        }
    }
    // A write that passed its token check ends first; then no canceled job writes.
    if !enabled {
        if let Some(gate) = gate {
            gate.wait_commits();
        }
    }
}

fn start_worker<R: Runtime>(app: &AppHandle<R>, jobs: &mut Registry) {
    if jobs.worker {
        return;
    }
    jobs.worker = true;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = WorkerGuard(app.clone());
        loop {
            let Some(gate) = app.try_state::<Online>().map(|online| online.gate.clone()) else {
                stop_worker(&app);
                return;
            };
            let job = {
                let state = app.state::<LyricsState>();
                let Ok(mut jobs) = state.jobs.lock() else {
                    return;
                };
                match jobs.take() {
                    Some((track, manual)) => {
                        let token = gate.job_token();
                        jobs.running.insert(
                            track,
                            Running {
                                token: token.clone(),
                                manual,
                            },
                        );
                        Some((track, manual, token))
                    }
                    None => {
                        jobs.worker = false;
                        None
                    }
                }
            };
            let Some((track, manual, token)) = job else {
                return;
            };
            let outcome = run(&app, &gate, track, manual, &token).await;
            // A no match whose marker is gone again: a click cleared it after the job wrote it.
            let cleared =
                !manual && outcome == Outcome::NoMatch && !no_match_kept(&app, track).await;
            if let Ok(mut jobs) = app.state::<LyricsState>().jobs.lock() {
                // A click joined an automatic job that skipped the song or found no match on a
                // marker the click has cleared since: the song runs again for the click (P24.6).
                let joined_later = !manual
                    && (matches!(outcome, Outcome::Skipped(_)) || cleared)
                    && jobs.running.get(&track).is_some_and(|job| job.manual)
                    && !token.is_cancelled();
                if joined_later {
                    jobs.running.remove(&track);
                    jobs.joined.insert(0, track);
                } else {
                    jobs.finish(track, &outcome);
                }
            }
        }
    });
}

/// The no-match result of a track is still recorded: its sidecar marker, or the result in
/// memory for a song outside an album folder (D60).
async fn no_match_kept<R: Runtime>(app: &AppHandle<R>, track: u32) -> bool {
    let Some(song) = song(app, track) else {
        return false;
    };
    match song.sidecar {
        Some((folder, key)) => {
            let album = song.root.join(folder);
            tauri::async_runtime::spawn_blocking(move || {
                sidecar::read(&album).lyrics_no_match(&key)
            })
            .await
            .unwrap_or(false)
        }
        None => app
            .state::<LyricsState>()
            .jobs
            .lock()
            .is_ok_and(|jobs| jobs.no_match.contains(&track)),
    }
}

fn stop_worker<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(mut jobs) = app.state::<LyricsState>().jobs.lock() {
        jobs.worker = false;
    }
}

/// Clears the worker flag if the task ends by a panic, so the next job starts a new one.
struct WorkerGuard<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Drop for WorkerGuard<R> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            // The worker runs one job at a time: the running one ended with the panic.
            if let Ok(mut jobs) = self.0.state::<LyricsState>().jobs.lock() {
                let tracks: Vec<u32> = jobs.running.keys().copied().collect();
                for track in tracks {
                    jobs.finish(track, &Outcome::Failed("The lyrics fetch failed".into()));
                }
                jobs.worker = false;
            }
        }
    }
}

/// What a job needs to know about its song, read under the locks.
struct Song {
    path: PathBuf,
    query: LyricsQuery,
    /// The album folder (`Artist/Album`) and the key in its sidecar (D60).
    sidecar: Option<(String, String)>,
    root: PathBuf,
}

fn song<R: Runtime>(app: &AppHandle<R>, track: u32) -> Option<Song> {
    let (rel_path, query) = {
        let library = app.state::<Library>();
        let index = library.0.read().ok()?;
        let song = index.track(track)?;
        (song.rel_path().to_owned(), LyricsQuery::for_track(song))
    };
    let root = app.state::<MusicRoot>().0.read().ok()?.clone()?;
    Some(Song {
        path: root.join(&rel_path),
        sidecar: clawdio_core::scan::sidecar_key(&rel_path),
        query,
        root,
    })
}

/// A marker changed `sidecar.json` but no song value: the index keeps the new stamp, so the
/// next scan does not read the album's songs again (P24.4).
fn sidecar_written<R: Runtime>(app: &AppHandle<R>, root: &Path, folder: &str) {
    let Some((artist, album)) = folder.split_once('/') else {
        return;
    };
    let stamp = clawdio_core::artwork::stamp(&root.join(folder).join(sidecar::SIDECAR_FILE));
    if let Ok(mut index) = app.state::<Library>().0.write() {
        index.set_sidecar(artist, album, stamp);
    }
}

/// The checks before any request, on a blocking thread: an automatic job skips a song with an
/// R9 source or a marker (D60); every job needs a writable folder. Also tells whether the
/// sidecar is corrupt, so the job does not log it a second time.
fn check(song: &Song, manual: bool) -> Result<bool, Outcome> {
    let mut corrupt = false;
    if !manual {
        if clawdio_core::lyrics::load(&song.path).is_some() {
            return Err(Outcome::Skipped("The song has lyrics".into()));
        }
        if let Some((folder, key)) = &song.sidecar {
            let read = sidecar::read(&song.root.join(folder));
            corrupt = read == sidecar::Sidecar::Corrupt;
            if read.lyrics_no_match(key) {
                return Err(Outcome::Skipped("The song has no lyrics online".into()));
            }
        }
    }
    match online_lyrics::check_writable(&song.path) {
        Ok(()) => Ok(corrupt),
        Err(error) => {
            if !manual {
                // R23: logged, no status line text (requirements section 5).
                log::info!("lyrics: skipped {}: {error}", song.path.display());
            }
            Err(Outcome::Skipped(error.to_string()))
        }
    }
}

/// One job: the checks, the R9.2 chain, then the file, the marker or nothing (R9.3).
async fn run<R: Runtime>(
    app: &AppHandle<R>,
    gate: &Arc<OnlineGate>,
    track: u32,
    manual: bool,
    token: &CancellationToken,
) -> Outcome {
    if !manual && !auto_enabled(app) {
        return Outcome::Skipped("Fetch lyrics automatically is off".into());
    }
    let skip_memory = !manual
        && app
            .state::<LyricsState>()
            .jobs
            .lock()
            .is_ok_and(|jobs| jobs.no_match.contains(&track));
    if skip_memory {
        return Outcome::Skipped("The song has no lyrics online".into());
    }
    let Some(song) = song(app, track) else {
        return Outcome::Skipped("The song is not in the library".into());
    };
    let song = Arc::new(song);
    let checked = {
        let song = song.clone();
        tauri::async_runtime::spawn_blocking(move || check(&song, manual)).await
    };
    let corrupt = match checked {
        Ok(Ok(corrupt)) => corrupt,
        Ok(Err(outcome)) => return outcome,
        Err(_) => return Outcome::Failed("The song's folder cannot be checked".into()),
    };
    let found = online_lyrics::fetch(gate, &song.query, token).await;
    let commits = gate.commit_lock();
    match found {
        Err(NetError::Canceled | NetError::Off) => Outcome::Canceled,
        Err(error) => {
            log::info!("lyrics: no result for track {track}, no marker: {error}");
            Outcome::Failed(format!("Cannot fetch lyrics: {error}"))
        }
        Ok(Some(found)) => {
            let (token, path) = (token.clone(), song.path.clone());
            let saved = tauri::async_runtime::spawn_blocking(move || {
                commits.run(&token, || online_lyrics::save(&path, &found))
            })
            .await;
            match saved {
                Ok(Ok(Ok(()))) => {
                    let playing = app
                        .state::<LyricsState>()
                        .song
                        .lock()
                        .is_ok_and(|song| *song == Some(track));
                    if playing {
                        emit(app, LYRICS_CHANGED, ());
                    }
                    Outcome::Saved
                }
                Ok(Ok(Err(error))) => Outcome::Failed(error.to_string()),
                Ok(Err(_)) => Outcome::Canceled,
                Err(_) => Outcome::Failed("The lyrics file cannot be written".into()),
            }
        }
        Ok(None) => {
            let Some((folder, key)) = song.sidecar.clone() else {
                // D60: no album folder, so the result stays in memory for this app run.
                let kept = commits.run(token, || {
                    if let Ok(mut jobs) = app.state::<LyricsState>().jobs.lock() {
                        jobs.no_match.insert(track);
                    }
                });
                return if kept.is_ok() {
                    Outcome::NoMatch
                } else {
                    Outcome::Canceled
                };
            };
            if corrupt {
                // D44: a corrupt sidecar is not rewritten; the check logged it once.
                return Outcome::NoMatch;
            }
            let (token, album) = (token.clone(), song.root.join(&folder));
            let written = tauri::async_runtime::spawn_blocking(move || {
                commits.run(&token, || {
                    sidecar::write_lyrics_marker(&album, &key, SystemTime::now())
                })
            })
            .await;
            match written {
                Ok(Ok(Ok(()))) => {
                    sidecar_written(app, &song.root, &folder);
                    Outcome::NoMatch
                }
                // A corrupt sidecar: its read logged it once (P24-AC5).
                Ok(Ok(Err(sidecar::SidecarError::Corrupt))) => Outcome::NoMatch,
                Ok(Ok(Err(error))) => {
                    log::warn!("lyrics: no marker for track {track}: {error}");
                    Outcome::NoMatch
                }
                Ok(Err(_)) => Outcome::Canceled,
                Err(_) => Outcome::Failed("The sidecar cannot be written".into()),
            }
        }
    }
}

/// "Fetch lyrics" (P15, P24.6): the R9.2 chain for the song, then `.lrc` or `.txt` next to it.
/// True when lyrics were saved; the widget reads them on `lyrics-changed`. An error when
/// Online lookups are off (no request) or the folder is read-only (checked first).
#[tauri::command]
pub async fn lyrics_fetch(app: AppHandle, track: u32) -> CommandResult<bool> {
    fetch(&app, track).await
}

async fn fetch<R: Runtime>(app: &AppHandle<R>, track: u32) -> CommandResult<bool> {
    let gate = app
        .try_state::<Online>()
        .map(|online| online.gate.clone())
        .ok_or_else(|| fetch_error("Online lookups are not available. The log has the reason"))?;
    if !gate.is_on() {
        return Err(fetch_error("Online lookups are off"));
    }
    // Switch-off during the checks below cancels this token, also when the switch is on
    // again before the request joins the registry (R7).
    let preflight = gate.job_token();
    let song = {
        let in_library = app
            .state::<Library>()
            .0
            .read()
            .map_err(|_| super::lock_error())?
            .track(track)
            .is_some();
        if !in_library {
            return Err(fetch_error("The song is not in the library"));
        }
        song(app, track).ok_or_else(|| fetch_error("Choose a music folder first"))?
    };
    let generation = app
        .state::<LyricsState>()
        .jobs
        .lock()
        .map_err(|_| super::lock_error())?
        .generation;
    let canceled = || {
        emit(app, STATUS_MESSAGE, "Lyrics fetch canceled");
        Ok(false)
    };
    // File work runs on a blocking thread, so a slow disk never stalls the runtime.
    let (probe, sidecar_entry, root) = (song.path.clone(), song.sidecar.clone(), song.root.clone());
    let (commits, handle) = (gate.commit_lock(), app.clone());
    let cleared = tauri::async_runtime::spawn_blocking(move || {
        online_lyrics::check_writable(&probe)?;
        // D60: the marker goes first, so the chain runs; a corrupt sidecar stays (D44), its
        // read logs it, and the chain runs anyway (P24.6). Under the commit lock, so a folder
        // change that returned has no clear after it.
        let clear = commits.run(&CancellationToken::new(), || {
            let same = handle
                .state::<LyricsState>()
                .jobs
                .lock()
                .is_ok_and(|jobs| jobs.generation == generation);
            if !same {
                return None;
            }
            Some(sidecar_entry.and_then(|(folder, key)| {
                sidecar::clear_lyrics_marker(&root.join(&folder), &key)
                    .ok()
                    .and_then(|done| done.then_some(folder))
            }))
        });
        Ok(clear.ok().flatten())
    })
    .await
    .map_err(|_| fetch_error("The song's folder cannot be checked"))?
    .map_err(|error: online_lyrics::SaveError| fetch_error(error.to_string()))?;
    let Some(cleared) = cleared else {
        return canceled();
    };
    if let Some(folder) = cleared {
        sidecar_written(app, &song.root, &folder);
    }
    let (reply, mut answer) = channel(1);
    {
        let state = app.state::<LyricsState>();
        let mut jobs = state.jobs.lock().map_err(|_| super::lock_error())?;
        if jobs.generation != generation || preflight.is_cancelled() {
            drop(jobs);
            return canceled();
        }
        jobs.no_match.remove(&track);
        let live = jobs
            .running
            .get_mut(&track)
            .filter(|running| !running.token.is_cancelled());
        if let Some(running) = live {
            running.manual = true;
        } else if let Some(index) = jobs.auto.iter().position(|queued| *queued == track) {
            jobs.auto.remove(index);
            jobs.joined.push(track);
        } else if !jobs.joined.contains(&track) {
            jobs.joined.push(track);
        }
        jobs.waiters.entry(track).or_default().push(reply);
        start_worker(app, &mut jobs);
    }
    progress(app, Some("Fetching lyrics"));
    let outcome = answer.recv().await.unwrap_or(Outcome::Canceled);
    progress(app, None);
    match outcome {
        Outcome::Saved => {
            emit(app, STATUS_MESSAGE, "Lyrics saved");
            emit(app, LYRICS_CHANGED, ());
            Ok(true)
        }
        Outcome::NoMatch => {
            emit(app, STATUS_MESSAGE, "No lyrics found");
            Ok(false)
        }
        Outcome::Canceled => canceled(),
        Outcome::Skipped(message) | Outcome::Failed(message) => Err(fetch_error(message)),
    }
}

/// Cancel on the status line (R5): stops every job a manual request waits for; no file is
/// written after it. Automatic jobs show nothing on the status line and continue.
pub fn cancel_manual<R: Runtime>(app: &AppHandle<R>) {
    let gate = app.try_state::<Online>().map(|online| online.gate.clone());
    if let Ok(mut jobs) = app.state::<LyricsState>().jobs.lock() {
        let joined: Vec<u32> = jobs.joined.drain(..).collect();
        jobs.drop_queued(joined);
        for job in jobs.running.values().filter(|job| job.manual) {
            job.token.cancel();
        }
        jobs.cancel_waiters();
    }
    if let Some(gate) = gate {
        gate.wait_commits();
    }
}

/// A music folder change (P5.9, P24.5): cancels and drains every lyrics job, queued and
/// running, and waits for a running write, so no old job writes after the new folder is
/// active. The results kept in memory belong to the old folder and go too.
pub fn cancel<R: Runtime>(app: &AppHandle<R>) {
    let gate = app.try_state::<Online>().map(|online| online.gate.clone());
    if let Ok(mut jobs) = app.state::<LyricsState>().jobs.lock() {
        let queued = jobs.all_queued();
        jobs.drop_queued(queued);
        for job in jobs.running.values() {
            job.token.cancel();
        }
        jobs.no_match.clear();
        jobs.generation += 1;
        jobs.cancel_waiters();
        jobs.applied = (None, None);
        jobs.targets = (None, None);
    }
    if let Some(gate) = gate {
        gate.wait_commits();
    }
}

/// After a complete scan: when the shown song's lyrics source changed, tell the widget
/// (section 5: folder edits appear after Rescan).
pub fn after_scan<R: Runtime>(app: &AppHandle<R>) {
    let Some((track, old)) = app
        .state::<LyricsState>()
        .served
        .lock()
        .ok()
        .and_then(|served| served.clone())
    else {
        return;
    };
    let new = read(app, track);
    if new == old {
        return;
    }
    if let Ok(mut served) = app.state::<LyricsState>().served.lock() {
        *served = Some((track, new));
    }
    emit(app, LYRICS_CHANGED, ());
}

/// The playing song changed: the widget reads the new song's lyrics.
pub fn song_changed<R: Runtime>(app: &AppHandle<R>, song: Option<u32>) {
    let state = app.state::<LyricsState>();
    let changed = state
        .song
        .lock()
        .is_ok_and(|mut current| std::mem::replace(&mut *current, song) != song);
    if changed {
        emit(app, LYRICS_CHANGED, ());
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, RwLock};

    use clawdio_core::library::{FileStamp, LibraryIndex, NewTrack};
    use tauri::test::{mock_app, MockRuntime};
    use tauri::Listener;

    use super::*;

    /// An app with one track, "A/B/01 Song.mp3", in `music`, and a counter of
    /// `lyrics-changed` events.
    fn app(music: &Path) -> (tauri::App<MockRuntime>, Arc<AtomicU32>) {
        std::fs::create_dir_all(music.join("A/B")).unwrap();
        std::fs::write(music.join("A/B/01 Song.mp3"), b"").unwrap();
        let app = mock_app();
        let mut index = LibraryIndex::default();
        index.insert(NewTrack {
            rel_path: "A/B/01 Song.mp3".into(),
            artist: "A".into(),
            album: "B".into(),
            subfolder: None,
            title: "Song".into(),
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        });
        app.manage(Library(Arc::new(RwLock::new(index))));
        app.manage(MusicRoot(Arc::new(RwLock::new(Some(music.to_path_buf())))));
        app.manage(LyricsState::default());
        let events = Arc::new(AtomicU32::new(0));
        let counter = events.clone();
        app.listen_any(LYRICS_CHANGED, move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        (app, events)
    }

    /// P13-AC6: adding, editing and removing the `.lrc` file, then a scan, tells the widget;
    /// a scan with no change does not.
    #[test]
    fn a_scan_reports_a_changed_lyrics_source_of_the_shown_song() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        let lrc = music.path().join("A/B/01 Song.lrc");
        song_changed(handle, Some(0));
        events.store(0, Ordering::SeqCst);
        assert_eq!(get(handle, 0), None);
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 0, "no change");
        std::fs::write(&lrc, "[00:01.00]one").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 1, "added");
        assert_eq!(
            get(handle, 0).map(|lyrics| lyrics.text).as_deref(),
            Some("one")
        );
        std::fs::write(&lrc, "[00:01.00]two").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 2, "edited");
        std::fs::remove_file(&lrc).unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 3, "removed");
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 3, "no change");
    }

    #[test]
    fn a_new_playing_song_tells_the_widget_once() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        song_changed(handle, Some(0));
        song_changed(handle, Some(0));
        assert_eq!(events.load(Ordering::SeqCst), 1);
        song_changed(handle, None);
        assert_eq!(events.load(Ordering::SeqCst), 2);
    }

    /// A late answer for the song before does not replace the playing song's lyrics.
    #[test]
    fn only_the_playing_song_counts_for_the_scan_check() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let handle = app.handle();
        song_changed(handle, Some(0));
        events.store(0, Ordering::SeqCst);
        assert_eq!(get(handle, 0), None);
        assert_eq!(get(handle, 99), None, "a late answer for another song");
        std::fs::write(music.path().join("A/B/01 Song.lrc"), "one").unwrap();
        after_scan(handle);
        assert_eq!(events.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn an_unknown_track_has_no_lyrics() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        assert_eq!(get(app.handle(), 99), None);
    }

    /// Adds a track to the library and an empty file for it. Its title is the file name
    /// without the extension and the number prefix.
    fn add(app: &tauri::App<MockRuntime>, music: &Path, rel_path: &str) -> u32 {
        let path = music.join(rel_path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"").unwrap();
        let mut parts = rel_path.split('/');
        let artist = parts.next().unwrap().to_owned();
        let album = if rel_path.matches('/').count() >= 2 {
            parts.next().unwrap().to_owned()
        } else {
            String::new()
        };
        let stem = Path::new(rel_path).file_stem().unwrap().to_string_lossy();
        let title = stem
            .split_once(' ')
            .map_or(stem.as_ref(), |(_, rest)| rest)
            .to_owned();
        let library = app.state::<Library>();
        let mut index = library.0.write().unwrap();
        index.insert(NewTrack {
            rel_path: rel_path.into(),
            artist,
            album,
            subfolder: None,
            title,
            tag_artist: None,
            track_no: None,
            disc: None,
            duration_ms: 1000,
            stamp: FileStamp::default(),
            has_picture: false,
        });
        index.track_at(rel_path).unwrap().id
    }

    /// The app with Online lookups pointed at a mock server for LRCLIB and lyrics.ovh, the D64
    /// notice answered and "Fetch lyrics automatically" set to `auto`.
    fn online(app: &tauri::App<MockRuntime>, server: &httpmock::MockServer, on: bool) {
        use clawdio_core::net::{NetConfig, Url};
        let mut config = NetConfig::production("Test/1 ( https://example.org )".into());
        let base = Url::parse(&format!("{}/", server.base_url())).unwrap();
        config.lrclib = base.clone();
        config.lyrics_ovh = base;
        config.hosts = clawdio_core::net::Hosts::every(&["127.0.0.1"]);
        config.https_only = false;
        config.use_proxy = false;
        config.lrclib_gap = std::time::Duration::ZERO;
        let gate = OnlineGate::new(config, on).unwrap();
        gate.set_lyrics_ovh_allowed(true);
        app.manage(Online::new(gate));
    }

    fn set_auto(app: &tauri::App<MockRuntime>, on: bool) {
        app.state::<LyricsState>()
            .auto_on
            .store(on, Ordering::SeqCst);
        rules_changed(app.handle(), false);
    }

    /// LRCLIB knows no song; lyrics.ovh knows the titles in `known`.
    fn server(known: &[&str]) -> httpmock::MockServer {
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.path_includes("/api/");
            then.status(404);
        });
        for title in known {
            server.mock(|when, then| {
                when.path_includes(format!("/{title}"));
                then.status(200)
                    .body(format!(r#"{{"lyrics":"words of {title}"}}"#));
            });
        }
        server.mock(|when, then| {
            when.path_includes("/v1/");
            then.status(404).body(r#"{"error":"No lyrics found"}"#);
        });
        server
    }

    fn requests(app: &tauri::App<MockRuntime>) -> u64 {
        app.state::<Online>().gate.request_count()
    }

    /// Waits until no lyrics job runs or waits.
    fn wait_idle(app: &tauri::App<MockRuntime>) {
        let start = std::time::Instant::now();
        loop {
            let idle = app
                .state::<LyricsState>()
                .jobs
                .lock()
                .map(|jobs| !jobs.worker && jobs.running.is_empty())
                .unwrap();
            if idle {
                return;
            }
            assert!(
                start.elapsed() < std::time::Duration::from_secs(10),
                "jobs did not end"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    fn registry() -> Registry {
        Registry::default()
    }

    /// D61: the playing song first, then the next; a new next song drops the old queued one.
    #[test]
    fn the_registry_queues_the_playing_then_the_next_song() {
        let mut jobs = registry();
        jobs.targets = (Some(1), Some(2));
        assert!(jobs.retarget(true));
        assert_eq!(jobs.auto, vec![1, 2]);
        jobs.targets = (Some(1), Some(3));
        assert!(jobs.retarget(true));
        assert_eq!(jobs.auto, vec![1, 3], "the old next song is dropped");
        assert!(!jobs.retarget(true), "no change, no new job");
        jobs.targets = (Some(3), Some(4));
        jobs.retarget(true);
        assert_eq!(jobs.auto, vec![3, 4], "the playing song goes first");
        jobs.targets = (None, None);
        jobs.retarget(true);
        assert!(jobs.auto.is_empty(), "stopped: nothing queued");
    }

    /// D61, P24-AC6: `A` running, `B` joined by a click, the song changes to `C`: `B`, `C` and
    /// `D` all run; a running job continues.
    #[test]
    fn a_joined_job_survives_a_song_change() {
        let mut jobs = registry();
        jobs.targets = (Some(10), Some(11));
        jobs.retarget(true);
        let (a, _) = jobs.take().unwrap();
        jobs.running.insert(
            a,
            Running {
                token: CancellationToken::new(),
                manual: false,
            },
        );
        jobs.auto.retain(|track| *track != 11);
        jobs.joined.push(11);
        jobs.targets = (Some(12), Some(13));
        jobs.retarget(true);
        assert!(jobs.running.contains_key(&10));
        assert_eq!(jobs.joined, vec![11]);
        assert_eq!(jobs.auto, vec![12, 13]);
        assert_eq!(jobs.take(), Some((11, true)), "a person waits: first");
        assert_eq!(jobs.take(), Some((12, false)));
        assert_eq!(jobs.take(), Some((13, false)));
        assert_eq!(jobs.take(), None);
    }

    /// P24-AC7: a job canceled by a switch is not live: turning the switch on again before it
    /// ends queues the song again, and its waiters wait for the new job.
    #[test]
    fn a_canceled_running_job_does_not_block_a_new_one() {
        let mut jobs = registry();
        jobs.targets = (Some(1), None);
        jobs.retarget(true);
        let (track, _) = jobs.take().unwrap();
        let token = CancellationToken::new();
        jobs.running.insert(
            track,
            Running {
                token: token.clone(),
                manual: false,
            },
        );
        token.cancel();
        jobs.retarget(false);
        assert!(jobs.retarget(true));
        assert_eq!(jobs.auto, vec![1]);
        let (reply, mut answer) = channel(1);
        jobs.waiters.entry(1).or_default().push(reply);
        jobs.finish(1, &Outcome::Canceled);
        assert!(
            answer.try_recv().is_err(),
            "the waiter waits for the queued job"
        );
        jobs.take();
        jobs.finish(1, &Outcome::Saved);
        assert_eq!(answer.try_recv().ok(), Some(Outcome::Saved));
    }

    /// Requirements section 5: after an error, a restart of the same song (a new play) asks
    /// again; a repeat of the same announcement does not.
    #[test]
    fn a_new_play_of_the_same_song_queues_it_again() {
        let mut jobs = registry();
        jobs.targets = (Some(1), None);
        jobs.play = 1;
        assert!(jobs.retarget(true));
        jobs.take();
        assert!(!jobs.retarget(true), "the same announcement");
        jobs.play = 2;
        assert!(jobs.retarget(true));
        assert_eq!(jobs.auto, vec![1]);
    }

    /// R7: switch-off answers a waiting click at once, also when a new job for the same
    /// track queues before the old one ends.
    #[test]
    fn cancel_answers_every_waiter() {
        let mut jobs = registry();
        let (reply, mut answer) = channel(1);
        jobs.waiters.entry(1).or_default().push(reply);
        jobs.auto.push(1);
        jobs.cancel_waiters();
        assert_eq!(answer.try_recv().ok(), Some(Outcome::Canceled));
        jobs.finish(1, &Outcome::Saved);
        assert!(answer.try_recv().is_err(), "no second answer");
    }

    /// D61: off clears the automatic queue; on queues both songs again.
    #[test]
    fn off_clears_and_on_queues_again() {
        let mut jobs = registry();
        jobs.targets = (Some(1), Some(2));
        jobs.retarget(true);
        jobs.retarget(false);
        assert!(jobs.auto.is_empty());
        assert!(jobs.retarget(true));
        assert_eq!(jobs.auto, vec![1, 2]);
    }

    /// P15-AC3, P15-AC7: found lyrics are saved and the widget is told at once.
    #[test]
    fn fetched_lyrics_are_saved_and_announced() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.path("/api/get").query_param("track_name", "Song");
            then.status(200)
                .body(r#"{"duration":1.0,"syncedLyrics":"[00:00.50]hi","plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        let saved = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(saved, Ok(true));
        let lrc = music.path().join("A/B/01 Song.lrc");
        assert_eq!(std::fs::read_to_string(lrc).unwrap(), "[00:00.50]hi\n");
        assert_eq!(events.load(Ordering::SeqCst), 1);
        assert_eq!(
            get(app.handle(), 0).map(|lyrics| lyrics.text).as_deref(),
            Some("hi")
        );
    }

    /// R5: Cancel on the status line stops a slow fetch at once, and no file is written.
    #[test]
    fn cancel_stops_a_slow_fetch_and_writes_nothing() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = httpmock::MockServer::start();
        let slow = server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .delay(std::time::Duration::from_secs(10))
                .body(r#"{"duration":1.0,"syncedLyrics":"[00:00.50]hi","plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        let handle = app.handle().clone();
        let started = std::time::Instant::now();
        let fetching =
            std::thread::spawn(move || tauri::async_runtime::block_on(fetch(&handle, 0)));
        // Cancel once the request is out: a cancel before the fetch starts has nothing to stop.
        while slow.calls() == 0 {
            assert!(started.elapsed() < std::time::Duration::from_secs(5));
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        cancel_manual(app.handle());
        assert_eq!(fetching.join().unwrap(), Ok(false));
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert!(!music.path().join("A/B/01 Song.lrc").exists());
        assert_eq!(events.load(Ordering::SeqCst), 0);
    }

    /// P15-AC6, P24-AC3: with the switch off no request is made; no result from every step
    /// writes the marker; "Fetch lyrics" clears it and requests again.
    #[test]
    fn no_result_writes_the_marker_and_fetch_clears_it() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let server = server(&[]);
        online(&app, &server, false);
        let result = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(
            result.map_err(|error| error.message),
            Err("Online lookups are off".into())
        );
        assert_eq!(requests(&app), 0);
        app.state::<Online>().gate.set_on(true);
        let result = tauri::async_runtime::block_on(fetch(app.handle(), 0));
        assert_eq!(result, Ok(false));
        assert_eq!(
            requests(&app),
            4,
            "get, search, get without album, lyrics.ovh"
        );
        let album = music.path().join("A/B");
        assert!(sidecar::read(&album).lyrics_no_match("01 Song.mp3"));
        assert_eq!(events.load(Ordering::SeqCst), 0);
        assert_eq!(
            tauri::async_runtime::block_on(fetch(app.handle(), 0)),
            Ok(false)
        );
        assert_eq!(requests(&app), 8, "the click requests again");
        assert!(sidecar::read(&album).lyrics_no_match("01 Song.mp3"));
    }

    /// P24-AC6, P24-AC12: a song change requests the playing and the next song, saves both
    /// files with no status text, and tells the widget about the playing song.
    #[test]
    fn a_song_change_fetches_the_playing_and_the_next_song() {
        let music = tempfile::tempdir().unwrap();
        let (app, events) = app(music.path());
        let next = add(&app, music.path(), "A/B/02 Next.mp3");
        let server = server(&["Song", "Next"]);
        online(&app, &server, true);
        set_auto(&app, true);
        let messages = Arc::new(AtomicU32::new(0));
        let counter = messages.clone();
        app.listen_any(STATUS_MESSAGE, move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        song_changed(app.handle(), Some(0));
        events.store(0, Ordering::SeqCst);
        targets(app.handle(), Some(0), Some(next), 0);
        wait_idle(&app);
        assert!(music.path().join("A/B/01 Song.txt").is_file());
        assert!(music.path().join("A/B/02 Next.txt").is_file());
        assert_eq!(events.load(Ordering::SeqCst), 1, "only the playing song");
        assert_eq!(messages.load(Ordering::SeqCst), 0, "no status line text");
        // A second play of a song with lyrics makes no request.
        let before = requests(&app);
        targets(app.handle(), None, None, 0);
        targets(app.handle(), Some(0), Some(next), 0);
        wait_idle(&app);
        assert_eq!(requests(&app), before);
    }

    /// P24-AC3, AC-28: no match marks the song in the album sidecar (with the `CD2/` key and
    /// no `CD2/sidecar.json`); the index keeps the new sidecar stamp; a second play makes no
    /// request. A song directly in an artist folder keeps the result in memory only.
    #[test]
    fn no_match_is_remembered_in_the_sidecar_or_in_memory() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let disc = add(&app, music.path(), "A/B/CD2/01 Deep.mp3");
        let loose = add(&app, music.path(), "A/01 Loose.mp3");
        let server = server(&[]);
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(disc), None, 0);
        wait_idle(&app);
        let album = music.path().join("A/B");
        assert!(sidecar::read(&album).lyrics_no_match("CD2/01 Deep.mp3"));
        assert!(!album.join("CD2").join(sidecar::SIDECAR_FILE).exists());
        let stamp = clawdio_core::artwork::stamp(&album.join(sidecar::SIDECAR_FILE));
        let stored = app
            .state::<Library>()
            .0
            .read()
            .unwrap()
            .album_sidecars()
            .find(|(artist, name, _)| *artist == "A" && *name == "B")
            .map(|(_, _, stamp)| stamp);
        assert_eq!(
            stored,
            Some(stamp),
            "the next scan does not read the album again"
        );
        targets(app.handle(), Some(loose), None, 0);
        wait_idle(&app);
        assert!(!music.path().join("A").join(sidecar::SIDECAR_FILE).exists());
        let before = requests(&app);
        for track in [disc, loose] {
            targets(app.handle(), None, None, 0);
            targets(app.handle(), Some(track), None, 0);
            wait_idle(&app);
        }
        assert_eq!(requests(&app), before, "no second request in this app run");
        assert_eq!(
            tauri::async_runtime::block_on(fetch(app.handle(), loose)),
            Ok(false)
        );
        assert_eq!(requests(&app), before + 4, "the click clears the memory");
    }

    /// P24-AC4, R9.3: an error writes no marker, and the next play requests again.
    #[test]
    fn an_error_writes_no_marker_and_the_next_play_requests_again() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.path_includes("/");
            then.status(503);
        });
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        assert!(!music
            .path()
            .join("A/B")
            .join(sidecar::SIDECAR_FILE)
            .exists());
        let before = requests(&app);
        assert!(before > 0);
        targets(app.handle(), None, None, 0);
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        assert!(requests(&app) > before, "tried again");
    }

    /// P24-AC7: with either switch off a song change makes zero requests; turning both on
    /// while a song plays requests the playing and the next song.
    #[test]
    fn the_switches_gate_the_automatic_fetch() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let next = add(&app, music.path(), "A/B/02 Next.mp3");
        let server = server(&["Song", "Next"]);
        online(&app, &server, false);
        set_auto(&app, true);
        targets(app.handle(), Some(0), Some(next), 0);
        wait_idle(&app);
        app.state::<Online>().gate.set_on(true);
        set_auto(&app, false);
        targets(app.handle(), Some(next), Some(0), 0);
        targets(app.handle(), Some(0), Some(next), 0);
        wait_idle(&app);
        assert_eq!(requests(&app), 0);
        set_auto(&app, true);
        wait_idle(&app);
        assert!(music.path().join("A/B/01 Song.txt").is_file());
        assert!(music.path().join("A/B/02 Next.txt").is_file());
    }

    /// P24-AC7: turning the setting off during a fetch cancels it and writes nothing, unless
    /// a manual request joined it; Online lookups off cancels that one too (R7).
    #[test]
    fn turning_off_cancels_running_jobs() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let server = httpmock::MockServer::start();
        let slow = server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .delay(std::time::Duration::from_millis(1500))
                .body(r#"{"duration":1.0,"plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        set_auto(&app, true);
        let wait_request = |count: usize| {
            let started = std::time::Instant::now();
            while slow.calls() < count {
                assert!(started.elapsed() < std::time::Duration::from_secs(5));
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        };
        targets(app.handle(), Some(0), None, 0);
        wait_request(1);
        set_auto(&app, false);
        wait_idle(&app);
        assert!(!music.path().join("A/B/01 Song.txt").exists());
        assert!(!music
            .path()
            .join("A/B")
            .join(sidecar::SIDECAR_FILE)
            .exists());
        // A manual request joins the automatic job: the setting off does not cancel it.
        set_auto(&app, true);
        targets(app.handle(), None, None, 0);
        targets(app.handle(), Some(0), None, 0);
        wait_request(2);
        let handle = app.handle().clone();
        let click = std::thread::spawn(move || tauri::async_runtime::block_on(fetch(&handle, 0)));
        let started = std::time::Instant::now();
        while !app
            .state::<LyricsState>()
            .jobs
            .lock()
            .unwrap()
            .running
            .values()
            .any(|job| job.manual)
        {
            assert!(started.elapsed() < std::time::Duration::from_secs(5));
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        set_auto(&app, false);
        assert_eq!(click.join().unwrap(), Ok(true));
        assert_eq!(slow.calls(), 2, "one chain for the song");
        assert!(music.path().join("A/B/01 Song.txt").is_file());
    }

    /// P24-AC6: a click during an automatic job for the same song runs one chain.
    #[test]
    fn a_click_joins_the_running_job() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let server = httpmock::MockServer::start();
        let slow = server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .delay(std::time::Duration::from_millis(500))
                .body(r#"{"duration":1.0,"plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(0), None, 0);
        let started = std::time::Instant::now();
        while slow.calls() == 0 {
            assert!(started.elapsed() < std::time::Duration::from_secs(5));
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(
            tauri::async_runtime::block_on(fetch(app.handle(), 0)),
            Ok(true)
        );
        wait_idle(&app);
        assert_eq!(slow.calls(), 1);
        assert_eq!(requests(&app), 1);
    }

    /// P24-AC6: a music folder change with a queued and a running job writes nothing.
    #[test]
    fn a_folder_change_cancels_queued_and_running_jobs() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let next = add(&app, music.path(), "A/B/02 Next.mp3");
        let server = httpmock::MockServer::start();
        let slow = server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .delay(std::time::Duration::from_millis(800))
                .body(r#"{"duration":1.0,"plainLyrics":"hi"}"#);
        });
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(0), Some(next), 0);
        let started = std::time::Instant::now();
        while slow.calls() == 0 {
            assert!(started.elapsed() < std::time::Duration::from_secs(5));
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        cancel(app.handle());
        wait_idle(&app);
        std::thread::sleep(std::time::Duration::from_millis(1000));
        assert_eq!(slow.calls(), 1, "the queued job never ran");
        assert_eq!(
            std::fs::read_dir(music.path().join("A/B")).unwrap().count(),
            2
        );
    }

    /// P24-AC6: a song with a `.lrc`, a `.txt` or embedded lyrics gets no request.
    #[test]
    fn a_song_with_lyrics_gets_no_request() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        std::fs::write(music.path().join("A/B/01 Song.txt"), "words").unwrap();
        let server = server(&["Song"]);
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        assert_eq!(requests(&app), 0);
    }

    /// P24-AC5: a corrupt sidecar gets no marker and stays; "Fetch lyrics" still requests and
    /// saves a found file.
    #[test]
    fn a_corrupt_sidecar_stays_and_a_click_still_saves() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let file = music.path().join("A/B").join(sidecar::SIDECAR_FILE);
        std::fs::write(&file, "{broken").unwrap();
        let server = httpmock::MockServer::start();
        let mut missing = server.mock(|when, then| {
            when.path_includes("/api/");
            then.status(404);
        });
        server.mock(|when, then| {
            when.path_includes("/v1/");
            then.status(404).body(r#"{"error":"No lyrics found"}"#);
        });
        online(&app, &server, true);
        set_auto(&app, true);
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        assert_eq!(requests(&app), 4);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{broken");
        missing.delete();
        server.mock(|when, then| {
            when.path("/api/get");
            then.status(200)
                .body(r#"{"duration":1.0,"plainLyrics":"found"}"#);
        });
        assert_eq!(
            tauri::async_runtime::block_on(fetch(app.handle(), 0)),
            Ok(true)
        );
        assert!(music.path().join("A/B/01 Song.txt").is_file());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{broken");
    }

    /// P24-AC8: a read-only song folder: no request, no marker.
    #[cfg(unix)]
    #[test]
    fn a_read_only_folder_is_skipped_without_a_request() {
        use std::os::unix::fs::PermissionsExt;
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let server = server(&["Song"]);
        online(&app, &server, true);
        set_auto(&app, true);
        let folder = music.path().join("A/B");
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o555)).unwrap();
        if tempfile::NamedTempFile::new_in(&folder).is_ok() {
            std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
            eprintln!("skipped: the test runs with write access to read-only folders");
            return;
        }
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        std::fs::set_permissions(&folder, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(requests(&app), 0);
        assert!(!folder.join(sidecar::SIDECAR_FILE).exists());
    }

    /// P24-AC1, D64: before the notice answer, no lyrics.ovh request and no marker; "Keep on"
    /// runs the chain again for the playing song, with a lyrics.ovh request.
    #[test]
    fn the_notice_answer_runs_the_chain_again() {
        let music = tempfile::tempdir().unwrap();
        let (app, _) = app(music.path());
        let server = httpmock::MockServer::start();
        server.mock(|when, then| {
            when.path_includes("/api/");
            then.status(404);
        });
        let ovh = server.mock(|when, then| {
            when.path_includes("/v1/");
            then.status(200).body(r#"{"lyrics":"words"}"#);
        });
        online(&app, &server, true);
        app.state::<Online>().gate.set_lyrics_ovh_allowed(false);
        set_auto(&app, true);
        targets(app.handle(), Some(0), None, 0);
        wait_idle(&app);
        assert_eq!(ovh.calls(), 0);
        assert!(!music
            .path()
            .join("A/B")
            .join(sidecar::SIDECAR_FILE)
            .exists());
        app.state::<Online>().gate.set_lyrics_ovh_allowed(true);
        rules_changed(app.handle(), true);
        wait_idle(&app);
        assert_eq!(ovh.calls(), 1);
        assert!(music.path().join("A/B/01 Song.txt").is_file());
    }
}
