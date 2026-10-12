//! `library.sqlite`, the rebuildable library cache (R19, D14). Paths are relative to the music
//! folder root. A different schema version deletes the file and rebuilds it. The cache holds
//! the D44 flags and no lookup markers.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::library::{CoverInfo, CoverState, FileStamp, NewTrack};

pub const CACHE_FILE: &str = "library.sqlite";
pub const SCHEMA_VERSION: i32 = 4;

const SCHEMA: &str = "
CREATE TABLE tracks (
    rel_path TEXT PRIMARY KEY,
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    subfolder TEXT,
    title TEXT NOT NULL,
    tag_artist TEXT,
    track_no INTEGER,
    disc INTEGER,
    duration_ms INTEGER NOT NULL,
    size INTEGER NOT NULL,
    modified_ms INTEGER NOT NULL,
    has_picture INTEGER NOT NULL
);
CREATE TABLE albums (
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    cover_state INTEGER NOT NULL,
    cover_name TEXT,
    cover_size INTEGER,
    cover_modified_ms INTEGER,
    PRIMARY KEY (artist, album)
);
CREATE TABLE sidecars (
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_ms INTEGER NOT NULL,
    PRIMARY KEY (artist, album)
);
CREATE TABLE skipped (
    rel_path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    modified_ms INTEGER NOT NULL,
    reason TEXT NOT NULL
);";

/// A skipped file: relative path, stamp and reason.
pub type SkippedEntry = (String, FileStamp, String);

/// A stored sidecar stamp: artist and album folder names and the file stamp.
pub type SidecarEntry = (String, String, FileStamp);

/// An album row: artist and album folder names and the cover information.
pub type AlbumEntry = (String, String, CoverInfo);

pub struct Cache {
    connection: Connection,
    /// The file had another schema version and was rebuilt empty.
    pub rebuilt: bool,
}

fn state_code(state: CoverState) -> i64 {
    match state {
        CoverState::None => 0,
        CoverState::Valid => 1,
        CoverState::Broken => 2,
    }
}

fn state_from(code: i64) -> CoverState {
    match code {
        1 => CoverState::Valid,
        2 => CoverState::Broken,
        _ => CoverState::None,
    }
}

impl Cache {
    /// Opens or creates the cache in `cache_dir`. A file with another schema version, or one
    /// that is not a readable database, is deleted and created again (R19: no migrations).
    pub fn open(cache_dir: &Path) -> rusqlite::Result<Self> {
        std::fs::create_dir_all(cache_dir)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let path = cache_dir.join(CACHE_FILE);
        let version = Connection::open(&path).and_then(|connection| {
            let version: i32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
            let has_tables = connection
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1",
                    [],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            Ok((connection, version, has_tables))
        });
        let rebuilt = match version {
            Ok((connection, version, _)) if version == SCHEMA_VERSION => {
                return Ok(Cache {
                    connection,
                    rebuilt: false,
                });
            }
            Ok((connection, version, has_tables)) => {
                // The file must be closed before it can be deleted (Windows).
                drop(connection);
                if has_tables {
                    log::info!("cache: schema version {version}, rebuilding for {SCHEMA_VERSION}");
                }
                has_tables
            }
            Err(error) => {
                log::warn!("cache: cannot read the cache file ({error}), rebuilding");
                true
            }
        };
        if rebuilt {
            std::fs::remove_file(&path)
                .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        }
        let mut cache = Self::create(Connection::open(&path)?)?;
        cache.rebuilt = rebuilt;
        Ok(cache)
    }

    /// An in-memory cache, for tests.
    pub fn in_memory() -> rusqlite::Result<Self> {
        Self::create(Connection::open_in_memory()?)
    }

    fn create(connection: Connection) -> rusqlite::Result<Self> {
        connection.execute_batch(SCHEMA)?;
        connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        Ok(Cache {
            connection,
            rebuilt: false,
        })
    }

    /// Writes a batch of tracks in one transaction. A row with the same path is replaced.
    pub fn put_batch(&mut self, tracks: &[NewTrack]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            let mut statement = transaction.prepare_cached(
                "INSERT OR REPLACE INTO tracks (rel_path, artist, album, subfolder, title,
                 tag_artist, track_no, disc, duration_ms, size, modified_ms, has_picture)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for track in tracks {
                statement.execute(params![
                    track.rel_path,
                    track.artist,
                    track.album,
                    track.subfolder,
                    track.title,
                    track.tag_artist,
                    track.track_no,
                    track.disc,
                    track.duration_ms,
                    track.stamp.size as i64,
                    track.stamp.modified_ms,
                    track.has_picture,
                ])?;
            }
        }
        transaction.commit()
    }

    /// Removes the tracks with these relative paths in one transaction.
    pub fn remove_paths(&mut self, paths: &[String]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            let mut statement =
                transaction.prepare_cached("DELETE FROM tracks WHERE rel_path = ?1")?;
            for path in paths {
                statement.execute([path])?;
            }
        }
        transaction.commit()
    }

    /// Replaces the album rows (cover information, D44).
    pub fn put_albums(&mut self, albums: &[AlbumEntry]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            transaction.execute("DELETE FROM albums", [])?;
            let mut statement = transaction.prepare_cached(
                "INSERT INTO albums (artist, album, cover_state, cover_name, cover_size,
                 cover_modified_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            for (artist, album, cover) in albums {
                let file = cover.file.as_ref();
                statement.execute(params![
                    artist,
                    album,
                    state_code(cover.state),
                    file.map(|(name, _)| name),
                    file.map(|(_, stamp)| stamp.size as i64),
                    file.map(|(_, stamp)| stamp.modified_ms),
                ])?;
            }
        }
        transaction.commit()
    }

    /// Replaces the stored `sidecar.json` stamps, one per album folder (P5.3, P16.5).
    pub fn put_sidecars(&mut self, sidecars: &[SidecarEntry]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            transaction.execute("DELETE FROM sidecars", [])?;
            let mut statement = transaction.prepare_cached(
                "INSERT INTO sidecars (artist, album, size, modified_ms) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (artist, album, stamp) in sidecars {
                statement.execute(params![artist, album, stamp.size as i64, stamp.modified_ms])?;
            }
        }
        transaction.commit()
    }

    /// Every stored `sidecar.json` stamp.
    pub fn sidecars(&self) -> rusqlite::Result<Vec<SidecarEntry>> {
        let mut statement = self
            .connection
            .prepare("SELECT artist, album, size, modified_ms FROM sidecars")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                FileStamp {
                    size: row.get::<_, i64>(2)?.max(0) as u64,
                    modified_ms: row.get(3)?,
                },
            ))
        })?;
        rows.collect()
    }

    /// Replaces the skipped files.
    pub fn put_skipped(&mut self, entries: &[SkippedEntry]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            transaction.execute("DELETE FROM skipped", [])?;
            let mut statement = transaction.prepare_cached(
                "INSERT INTO skipped (rel_path, size, modified_ms, reason) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (path, stamp, reason) in entries {
                statement.execute(params![path, stamp.size as i64, stamp.modified_ms, reason])?;
            }
        }
        transaction.commit()
    }

    /// Every skipped file.
    pub fn skipped(&self) -> rusqlite::Result<Vec<SkippedEntry>> {
        let mut statement = self
            .connection
            .prepare("SELECT rel_path, size, modified_ms, reason FROM skipped")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get(0)?,
                FileStamp {
                    size: row.get::<_, i64>(1)?.max(0) as u64,
                    modified_ms: row.get(2)?,
                },
                row.get(3)?,
            ))
        })?;
        rows.collect()
    }

    /// Every cached track.
    pub fn tracks(&self) -> rusqlite::Result<Vec<NewTrack>> {
        let mut statement = self.connection.prepare(
            "SELECT rel_path, artist, album, subfolder, title, tag_artist, track_no, disc,
             duration_ms, size, modified_ms, has_picture FROM tracks",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(NewTrack {
                rel_path: row.get(0)?,
                artist: row.get(1)?,
                album: row.get(2)?,
                subfolder: row.get(3)?,
                title: row.get(4)?,
                tag_artist: row.get(5)?,
                track_no: row.get(6)?,
                disc: row.get(7)?,
                duration_ms: row.get(8)?,
                stamp: FileStamp {
                    size: row.get::<_, i64>(9)?.max(0) as u64,
                    modified_ms: row.get(10)?,
                },
                has_picture: row.get(11)?,
            })
        })?;
        rows.collect()
    }

    /// Every cached album row.
    pub fn albums(&self) -> rusqlite::Result<Vec<AlbumEntry>> {
        let mut statement = self.connection.prepare(
            "SELECT artist, album, cover_state, cover_name, cover_size, cover_modified_ms
             FROM albums",
        )?;
        let rows = statement.query_map([], |row| {
            let name: Option<String> = row.get(3)?;
            let size: Option<i64> = row.get(4)?;
            let modified: Option<i64> = row.get(5)?;
            let file = match (name, size, modified) {
                (Some(name), Some(size), Some(modified_ms)) => Some((
                    name,
                    FileStamp {
                        size: size.max(0) as u64,
                        modified_ms,
                    },
                )),
                _ => None,
            };
            Ok((
                row.get(0)?,
                row.get(1)?,
                CoverInfo {
                    state: state_from(row.get(2)?),
                    file,
                },
            ))
        })?;
        rows.collect()
    }

    /// Removes every row, for a new music folder.
    pub fn clear(&mut self) -> rusqlite::Result<()> {
        self.connection.execute_batch(
            "DELETE FROM tracks; DELETE FROM albums; DELETE FROM sidecars; DELETE FROM skipped;",
        )
    }

    pub fn count(&self) -> rusqlite::Result<i64> {
        self.connection
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str) -> NewTrack {
        NewTrack {
            rel_path: path.into(),
            artist: "A".into(),
            album: "B".into(),
            subfolder: Some("Disc 1".into()),
            title: "T".into(),
            track_no: Some(1),
            disc: Some(2),
            duration_ms: 1000,
            stamp: FileStamp {
                size: 123,
                modified_ms: 456,
            },
            has_picture: true,
            ..NewTrack::default()
        }
    }

    #[test]
    fn writes_reads_removes_and_clears_tracks() {
        let mut cache = Cache::in_memory().unwrap();
        cache
            .put_batch(&[track("A/B/1.mp3"), track("A/B/2.mp3")])
            .unwrap();
        cache.put_batch(&[track("A/B/2.mp3")]).unwrap();
        assert_eq!(cache.count().unwrap(), 2);
        let mut rows = cache.tracks().unwrap();
        rows.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        assert_eq!(rows[0], track("A/B/1.mp3"));
        cache.remove_paths(&["A/B/1.mp3".into()]).unwrap();
        assert_eq!(cache.count().unwrap(), 1);
        cache.clear().unwrap();
        assert_eq!(cache.count().unwrap(), 0);
    }

    #[test]
    fn stores_the_cover_flags() {
        let mut cache = Cache::in_memory().unwrap();
        let cover = CoverInfo {
            state: CoverState::Broken,
            file: Some((
                "cover.jpg".into(),
                FileStamp {
                    size: 9,
                    modified_ms: 8,
                },
            )),
        };
        let albums = vec![
            ("A".to_string(), "B".to_string(), cover),
            ("A".to_string(), "C".to_string(), CoverInfo::default()),
        ];
        cache.put_albums(&albums).unwrap();
        let mut read = cache.albums().unwrap();
        read.sort_by(|a, b| a.1.cmp(&b.1));
        assert_eq!(read, albums);
    }

    #[test]
    fn a_file_that_is_not_a_database_is_rebuilt() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(CACHE_FILE),
            b"this is not SQLite at all, just text",
        )
        .unwrap();
        let mut cache = Cache::open(dir.path()).unwrap();
        assert!(cache.rebuilt);
        cache.put_batch(&[track("A/B/1.mp3")]).unwrap();
        assert_eq!(cache.count().unwrap(), 1);
    }

    #[test]
    fn stores_skipped_files() {
        let mut cache = Cache::in_memory().unwrap();
        let entries = vec![(
            "A/B/x.ogg".to_string(),
            FileStamp {
                size: 1,
                modified_ms: 2,
            },
            "unsupported codec".to_string(),
        )];
        cache.put_skipped(&entries).unwrap();
        assert_eq!(cache.skipped().unwrap(), entries);
    }

    #[test]
    fn another_schema_version_rebuilds_the_file() {
        let dir = tempfile::tempdir().unwrap();
        {
            let mut cache = Cache::open(dir.path()).unwrap();
            assert!(!cache.rebuilt);
            cache.put_batch(&[track("A/B/1.mp3")]).unwrap();
        }
        let reopened = Cache::open(dir.path()).unwrap();
        assert!(!reopened.rebuilt);
        assert_eq!(reopened.count().unwrap(), 1);
        reopened
            .connection
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        drop(reopened);
        let rebuilt = Cache::open(dir.path()).unwrap();
        assert!(rebuilt.rebuilt);
        assert_eq!(rebuilt.count().unwrap(), 0);
        let version: i32 = rebuilt
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }
}
