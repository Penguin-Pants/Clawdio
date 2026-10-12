//! Online services (P14.1, section 6.11, D29, R7). The HTTP client is private to this module:
//! every request goes through [`OnlineGate`], which checks the switch, the host allow-list
//! and the cancellation token.

pub mod artwork;
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
/// carry the `Lrclib-Client` header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Service {
    MusicBrainz,
    CoverArt,
    Lrclib,
}

/// Where requests go and how. Tests point the base URLs at a local mock server.
#[derive(Debug, Clone)]
pub struct NetConfig {
    pub musicbrainz: Url,
    pub cover_art: Url,
    pub lrclib: Url,
    /// Hosts a request or redirect may reach. ".archive.org" allows its subdomains.
    pub allowed_hosts: Vec<String>,
    pub https_only: bool,
    /// `<product>/<version> ( <contact URL> )` (R8, R31).
    pub user_agent: String,
    /// Least time between the starts of two MusicBrainz requests (R8).
    pub musicbrainz_gap: Duration,
    /// False in tests, so a proxy from the environment does not take local requests.
    pub use_proxy: bool,
}

impl NetConfig {
    /// The real services (section 6.11).
    pub fn production(user_agent: String) -> Self {
        let url = |text: &str| Url::parse(text).expect("a valid built-in URL");
        NetConfig {
            musicbrainz: url("https://musicbrainz.org/"),
            cover_art: url("https://coverartarchive.org/"),
            lrclib: url("https://lrclib.net/"),
            allowed_hosts: [
                "musicbrainz.org",
                "coverartarchive.org",
                "archive.org",
                ".archive.org",
                "lrclib.net",
            ]
            .map(str::to_owned)
            .to_vec(),
            https_only: true,
            user_agent,
            musicbrainz_gap: Duration::from_secs(1),
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
    requests: AtomicU64,
}

impl OnlineGate {
    pub fn new(config: NetConfig, on: bool) -> Result<Self, NetError> {
        // rustls needs one process-wide crypto provider; ring needs no extra build tools.
        // A second call finds it installed, which is fine.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let on = Arc::new(AtomicBool::new(on));
        let policy = {
            let on = on.clone();
            let allowed = config.allowed_hosts.clone();
            let https_only = config.https_only;
            Policy::custom(move |attempt| {
                if !on.load(Ordering::SeqCst) {
                    attempt.error(NetError::Off)
                } else if attempt.previous().len() > MAX_REDIRECTS {
                    attempt.error(NetError::NotAllowed)
                } else if !host_allowed(&allowed, https_only, attempt.url()) {
                    log::warn!("net: refused a redirect to {}", attempt.url());
                    attempt.error(NetError::NotAllowed)
                } else {
                    attempt.follow()
                }
            })
        };
        let mut builder = Client::builder()
            .user_agent(config.user_agent.clone())
            .redirect(policy)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30));
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
            requests: AtomicU64::new(0),
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
        }
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

    /// GET `url` and read the body, at most [`MAX_BODY`] bytes. `cancel` drops the request
    /// at once.
    pub async fn get(
        &self,
        service: Service,
        url: Url,
        cancel: &CancellationToken,
    ) -> Result<Body, NetError> {
        let run = async {
            if service == Service::MusicBrainz {
                self.musicbrainz_turn().await;
            }
            if !self.is_on() {
                return Err(NetError::Off);
            }
            if !host_allowed(&self.config.allowed_hosts, self.config.https_only, &url) {
                return Err(NetError::NotAllowed);
            }
            self.requests.fetch_add(1, Ordering::SeqCst);
            let mut request = self.client.get(url);
            if service == Service::Lrclib {
                request = request.header("Lrclib-Client", &self.config.user_agent);
            }
            let mut response = request.send().await.map_err(|error| self.error(error))?;
            let status = response.status();
            if !status.is_success() {
                return Err(NetError::Status(status.as_u16()));
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
            Ok(Body {
                bytes,
                content_type,
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
        if error.is_redirect() {
            return if self.is_on() {
                NetError::NotAllowed
            } else {
                NetError::Off
            };
        }
        NetError::Network(error.without_url().to_string())
    }
}

#[cfg(test)]
mod tests;
