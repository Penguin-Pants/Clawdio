//! P20.0 probe (K21): prints the two candidate microphone signals side by side, so the owner
//! can see which one follows Handy and a call app. It opens no capture stream and prints
//! counts only, never app names. Run it, use the microphone in other apps, then press Ctrl+C.

#[cfg(windows)]
fn main() {
    use clawdio_lib::mic::{ConsentStore, MicSource, WasapiSessions};
    use std::time::{Duration, Instant};

    let mut sessions = WasapiSessions::new();
    let mut store = ConsentStore::new();
    let start = Instant::now();
    let mut last = None;
    println!("Other apps recording, by signal. A line prints when a count changes.");
    println!("seconds  audio-sessions  consent-store");
    loop {
        let now = (sessions.recording(), store.recording());
        if last.as_ref() != Some(&now) {
            let show = |value: &Result<usize, String>| match value {
                Ok(count) => count.to_string(),
                Err(error) => format!("error: {error}"),
            };
            println!(
                "{:7.1}  {:>14}  {:>13}",
                start.elapsed().as_secs_f32(),
                show(&now.0),
                show(&now.1)
            );
            last = Some(now);
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("The microphone probe runs on Windows only.");
}
