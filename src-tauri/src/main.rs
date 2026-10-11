// Release builds on Windows open no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Exit with code 1 instead of a panic, for example when the WebView2 Runtime is missing (D38).
    if let Err(error) = clawdio_lib::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
