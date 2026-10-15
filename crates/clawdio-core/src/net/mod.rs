//! Online services (P14.1, section 6.11, D29, R7). The HTTP client is private to this module:
//! every request goes through [`OnlineGate`], which checks the switch, the host allow-list
//! and the cancellation token.

pub mod artwork;
pub mod lyrics;
pub mod metadata;
pub mod normalize;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::redirect::Policy;
use reqwest::Client;
pub use reqwest::Url;
use tokio::time::Instant;
pub use tokio_util::sync::CancellationToken;

/// Largest body the app reads (section 6.11).
pub const MAX_BODY: u64 = 10 * 1024 * 1024;
/// Most redirect hops per request (D29).
const MAX_REDIRECTS: usize = 5;

/// The service a request goes to. MusicBrainz requests are spaced (R8); LRCLIB requests
/// are spaced and carry the `Lrclib-Client` header (section 6.11).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Service {
    MusicBrainz,
    CoverArt,
    Lrclib,
    /// The last step of the lyrics chain (R9.2, D62).
    LyricsOvh,
}

/// The hosts each service may reach, by request or redirect (section 6.11). A redirect
/// stays inside the list of its own service (P24.3). ".archive.org" allows its subdomains.
#[derive(Debug, Clone, Default)]
pub struct Hosts {
    pub musicbrainz: Vec<String>,
    pub cover_art: Vec<String>,
    pub lrclib: Vec<String>,
    pub lyrics_ovh: Vec<String>,
}

impl Hosts {
    /// The same hosts for every service (tests).
    pub fn every(hosts: &[&str]) -> Self {
        let list: Vec<String> = hosts.iter().map(|host| (*host).to_owned()).collect();
        Hosts {
            musicbrainz: list.clone(),
            cover_art: list.clone(),
            lrclib: list.clone(),
            lyrics_ovh: list,
        }
    }

    pub fn of(&self, service: Service) -> &[String] {
        match service {
            Service::MusicBrainz => &self.musicbrainz,
            Service::CoverArt => &self.cover_art,
            Service::Lrclib => &self.lrclib,
            Service::LyricsOvh => &self.lyrics_ovh,
        }
    }
}

/// Where requests go and how. Tests point the base URLs at a local mock server.
#[derive(Debug, Clone)]
pub struct NetConfig {
    pub musicbrainz: Url,
    pub cover_art: Url,
    pub lrclib: Url,
    pub lyrics_ovh: Url,
    pub hosts: Hosts,
    pub https_only: bool,
    /// `<product>/<version> ( <contact URL> )` (R8, R31).
    pub user_agent: String,
    /// Least time between the starts of two MusicBrainz requests (R8).
    pub musicbrainz_gap: Duration,
    /// Least time between the starts of two LRCLIB requests (section 6.11, P24.3).
    pub lrclib_gap: Duration,
    /// The longest time one request may take (section 6.11).
    pub request_timeout: Duration,
    /// False in tests, so a proxy from the environment does not take local requests.
    pub use_proxy: bool,
}

impl NetConfig {
    /// The real services (section 6.11).
    pub fn production(user_agent: String) -> Self {
        let url = |text: &str| Url::parse(text).expect("a valid built-in URL");
        let list = |hosts: &[&str]| hosts.iter().map(|host| (*host).to_owned()).collect();
        NetConfig {
            musicbrainz: url("https://musicbrainz.org/"),
            cover_art: url("https://coverartarchive.org/"),
            lrclib: url("https://lrclib.net/"),
            lyrics_ovh: url("https://api.lyrics.ovh/"),
            hosts: Hosts {
                musicbrainz: list(&["musicbrainz.org"]),
                cover_art: list(&["coverartarchive.org", "archive.org", ".archive.org"]),
                lrclib: list(&["lrclib.net"]),
                lyrics_ovh: list(&["api.lyrics.ovh"]),
            },
            https_only: true,
            user_agent,
            musicbrainz_gap: Duration::from_secs(1),
            lrclib_gap: Duration::from_millis(500),
            request_timeout: Duration::from_secs(30),
            use_proxy: true,
        }
    }
}

/// Why a request gave no body. Messages hold no path or URL.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NetError {
    #[error("Online lookups are off")]
    Off,
    #[error("Canceled")]
    Canceled,
    #[error("The service answered {0}")]
    Status(u16),
    #[error("The download is larger than 10 MB")]
    TooLarge,
    #[error("The address is not one the app may reach")]
    NotAllowed,
    #[error("Network error: {0}")]
    Network(String),
    #[error("The service answer cannot be read")]
    BadAnswer,
    /// The service asked the app to wait (HTTP 429 or 503 with `Retry-After`); no request
    /// went out (section 6.11, P24.3).
    #[error("The service asks the app to wait")]
    Wait,
    /// The user has not answered the notice that names this service (D64).
    #[error("The service needs an answer to the Online lookups notice")]
    NoticePending,
}

/// The status and the body of an answer, also one that is not a success (D62).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub status: u16,
    pub body: Body,
}

/// LRCLIB waits this long after a 429 or 503 without a `Retry-After` header (section 6.11).
const DEFAULT_RETRY_AFTER: Duration = Duration::from_secs(60);
/// The longest wait a `Retry-After` header can ask for, so a huge value cannot overflow the
/// clock or block LRCLIB for longer than one hour.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(3600);

/// The wait a 429 or 503 asks for: `Retry-After` in seconds, else the default.
fn retry_after(headers: &reqwest::header::HeaderMap) -> Duration {
    headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.trim().parse::<u64>().ok())
        .map_or(DEFAULT_RETRY_AFTER, Duration::from_secs)
        .min(MAX_RETRY_AFTER)
}

/// LRCLIB's turn: the start of the last request and the time before which no request may go
/// out (section 6.11).
#[derive(Default)]
struct LrclibTurn {
    last: Option<Instant>,
    blocked_until: Option<Instant>,
}

/// A response body and its content type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Body {
    pub bytes: Vec<u8>,
    pub content_type: Option<String>,
}

fn host_allowed(allowed: &[String], https_only: bool, url: &Url) -> bool {
    if https_only && url.scheme() != "https" {
        return false;
    }
    if !matches!(url.scheme(), "https" | "http") {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    allowed.iter().any(|entry| match entry.strip_prefix('.') {
        Some(parent) => host
            .strip_suffix(parent)
            .is_some_and(|sub| sub.ends_with('.') && sub.len() > 1),
        None => host.eq_ignore_ascii_case(entry),
    })
}

/// The one way to the network (section 6.11). Off means no request starts.
pub struct OnlineGate {
    on: Arc<AtomicBool>,
    token: Mutex<CancellationToken>,
    client: Client,
    config: NetConfig,
    musicbrainz_last: tokio::sync::Mutex<Option<Instant>>,
    /// LRCLIB gets one request at a time, spaced, and waits after a 429 or 503 (6.11).
    lrclib_turn: tokio::sync::Mutex<LrclibTurn>,
    /// lyrics.ovh gets one request at a time (section 6.11).
    lyrics_ovh_turn: tokio::sync::Mutex<()>,
    /// The user answered the notice that names lyrics.ovh (D64).
    lyrics_ovh_allowed: AtomicBool,
    requests: AtomicU64,
    /// Held by each final file write of a job; Cancel and switch-off wait for it (R7).
    commits: Arc<Mutex<()>>,
}

/// The final write of a job runs under this lock after one more token check, so no file is
/// written once Cancel or switch-off has returned (P14.6).
#[derive(Clone)]
pub struct CommitLock(Arc<Mutex<()>>);

impl CommitLock {
    /// Runs `write` unless `cancel` fired. Cancel waits for a running `write` to end.
    pub fn run<T>(
        &self,
        cancel: &CancellationToken,
        write: impl FnOnce() -> T,
    ) -> Result<T, NetError> {
        let _commit = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if cancel.is_cancelled() {
            return Err(NetError::Canceled);
        }
        Ok(write())
    }
}

impl OnlineGate {
    pub fn new(config: NetConfig, on: bool) -> Result<Self, NetError> {
        // rustls needs one process-wide crypto provider; ring needs no extra build tools.
        // A second call finds it installed, which is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let on = Arc::new(AtomicBool::new(on));
        let mut builder = Client::builder()
            .user_agent(config.user_agent.clone())
            // The gate follows redirects itself, so each hop checks the switch and the hosts
            // of the request's own service (P24.3).
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(config.request_timeout);
        if !config.use_proxy {
            builder = builder.no_proxy();
        }
        let client = builder
            .build()
            .map_err(|error| NetError::Network(error.to_string()))?;
        Ok(OnlineGate {
            on,
            token: Mutex::new(CancellationToken::new()),
            client,
            config,
            musicbrainz_last: tokio::sync::Mutex::new(None),
            lrclib_turn: tokio::sync::Mutex::new(LrclibTurn::default()),
            lyrics_ovh_turn: tokio::sync::Mutex::new(()),
            lyrics_ovh_allowed: AtomicBool::new(false),
            requests: AtomicU64::new(0),
            commits: Arc::new(Mutex::new(())),
        })
    }

    pub fn config(&self) -> &NetConfig {
        &self.config
    }

    pub fn is_on(&self) -> bool {
        self.on.load(Ordering::SeqCst)
    }

    /// Turns the switch on or off. Off cancels every job token and drops in-flight requests
    /// (R7).
    pub fn set_on(&self, on: bool) {
        self.on.store(on, Ordering::SeqCst);
        if !on {
            if let Ok(mut token) = self.token.lock() {
                token.cancel();
                *token = CancellationToken::new();
            }
            self.wait_commits();
        }
    }

    /// The lock for the final file writes of jobs.
    pub fn commit_lock(&self) -> CommitLock {
        CommitLock(self.commits.clone())
    }

    /// Waits until no final write runs. Call it after a job token was canceled: from then on
    /// the job writes no file.
    pub fn wait_commits(&self) {
        drop(self.commits.lock());
    }

    /// Allows or blocks lyrics.ovh requests: allowed once the user answered the notice that
    /// names it (D64).
    pub fn set_lyrics_ovh_allowed(&self, allowed: bool) {
        self.lyrics_ovh_allowed.store(allowed, Ordering::SeqCst);
    }

    /// A token for one job. Cancel stops the job; turning the switch off stops all jobs.
    pub fn job_token(&self) -> CancellationToken {
        match self.token.lock() {
            Ok(token) => token.child_token(),
            Err(_) => {
                let token = CancellationToken::new();
                token.cancel();
                token
            }
        }
    }

    /// Requests started since the app started (P14-AC1 counts them).
    pub fn request_count(&self) -> u64 {
        self.requests.load(Ordering::SeqCst)
    }

    /// Waits until a MusicBrainz request may start: at least the configured gap after the
    /// last one, on a monotonic clock, for all callers (P14.2).
    async fn musicbrainz_turn(&self) {
        let mut last = self.musicbrainz_last.lock().await;
        if let Some(previous) = *last {
            tokio::time::sleep_until(previous + self.config.musicbrainz_gap).await;
        }
        *last = Some(Instant::now());
    }

    /// GET `url` and read the body, at most [`MAX_BODY`] bytes. An answer that is not a
    /// success is [`NetError::Status`]. `cancel` drops the request at once.
    pub async fn get(
        &self,
        service: Service,
        url: Url,
        cancel: &CancellationToken,
    ) -> Result<Body, NetError> {
        let answer = self.answer(service, url, cancel).await?;
        if !(200..300).contains(&answer.status) {
            return Err(NetError::Status(answer.status));
        }
        Ok(answer.body)
    }

    /// GET `url` and keep the status and the body of the final answer, also one that is not
    /// a success (D62). Redirects are followed inside the service's own hosts.
    pub async fn answer(
        &self,
        service: Service,
        url: Url,
        cancel: &CancellationToken,
    ) -> Result<Answer, NetError> {
        let run = async {
            if service == Service::MusicBrainz {
                self.musicbrainz_turn().await;
            }
            let mut lrclib = match service {
                Service::Lrclib => Some(self.lrclib_turn.lock().await),
                _ => None,
            };
            let _lyrics_ovh = match service {
                Service::LyricsOvh => Some(self.lyrics_ovh_turn.lock().await),
                _ => None,
            };
            if service == Service::LyricsOvh && !self.lyrics_ovh_allowed.load(Ordering::SeqCst) {
                return Err(NetError::NoticePending);
            }
            if let Some(turn) = lrclib.as_deref_mut() {
                if turn
                    .blocked_until
                    .is_some_and(|until| Instant::now() < until)
                {
                    return Err(NetError::Wait);
                }
                if let Some(last) = turn.last {
                    tokio::time::sleep_until(last + self.config.lrclib_gap).await;
                }
                turn.last = Some(Instant::now());
            }
            let hosts = self.config.hosts.of(service);
            if !self.is_on() {
                return Err(NetError::Off);
            }
            if !host_allowed(hosts, self.config.https_only, &url) {
                return Err(NetError::NotAllowed);
            }
            self.requests.fetch_add(1, Ordering::SeqCst);
            let mut url = url;
            let mut hops = 0;
            let mut response = loop {
                let mut request = self.client.get(url.clone());
                if service == Service::Lrclib {
                    request = request.header("Lrclib-Client", &self.config.user_agent);
                }
                let response = request.send().await.map_err(|error| self.error(error))?;
                if !response.status().is_redirection() {
                    break response;
                }
                let Some(next) = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|location| url.join(location).ok())
                else {
                    break response;
                };
                hops += 1;
                if !self.is_on() {
                    return Err(NetError::Off);
                }
                if hops > MAX_REDIRECTS || !host_allowed(hosts, self.config.https_only, &next) {
                    log::warn!("net: refused a redirect to {next}");
                    return Err(NetError::NotAllowed);
                }
                url = next;
            };
            let status = response.status();
            if let (Some(turn), 429 | 503) = (lrclib.as_deref_mut(), status.as_u16()) {
                turn.blocked_until = Some(Instant::now() + retry_after(response.headers()));
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_BODY)
            {
                return Err(NetError::TooLarge);
            }
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|error| self.error(error))? {
                if bytes.len() as u64 + chunk.len() as u64 > MAX_BODY {
                    return Err(NetError::TooLarge);
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(Answer {
                status: status.as_u16(),
                body: Body {
                    bytes,
                    content_type,
                },
            })
        };
        if cancel.is_cancelled() {
            return Err(self.canceled());
        }
        tokio::select! {
            result = run => result,
            () = cancel.cancelled() => Err(self.canceled()),
        }
    }

    fn canceled(&self) -> NetError {
        if self.is_on() {
            NetError::Canceled
        } else {
            NetError::Off
        }
    }

    fn error(&self, error: reqwest::Error) -> NetError {
        NetError::Network(error.without_url().to_string())
    }
}

#[cfg(test)]
mod tests;
