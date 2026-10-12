//! A logger that keeps the log lines in memory, so tests can count them.

use std::sync::{Mutex, Once};

static LINES: Mutex<Vec<String>> = Mutex::new(Vec::new());
static INSTALL: Once = Once::new();

struct Capture;

impl log::Log for Capture {
    fn enabled(&self, _: &log::Metadata<'_>) -> bool {
        true
    }

    fn log(&self, record: &log::Record<'_>) {
        if let Ok(mut lines) = LINES.lock() {
            lines.push(record.args().to_string());
        }
    }

    fn flush(&self) {}
}

pub fn install() {
    INSTALL.call_once(|| {
        let _ = log::set_logger(&Capture);
        log::set_max_level(log::LevelFilter::Info);
    });
}

/// The captured lines that contain `text`.
pub fn lines_with(text: &str) -> Vec<String> {
    LINES
        .lock()
        .map(|lines| lines.iter().filter(|l| l.contains(text)).cloned().collect())
        .unwrap_or_default()
}
