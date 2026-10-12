//! Idle memory on Linux (B9, D50). WebKitGTK's accelerated compositing and DMABUF renderer
//! keep large GL and layer buffers, and glibc keeps freed memory in per-thread arenas.

/// Non-composited rendering and no DMABUF renderer: about 200 MB less with 50,000 tracks
/// (P18.5).
const WEBKIT_SWITCHES: [&str; 2] = [
    "WEBKIT_DISABLE_COMPOSITING_MODE",
    "WEBKIT_DISABLE_DMABUF_RENDERER",
];

/// The value to set: "1" (off) unless the user set the variable.
fn switch_default(current: Option<&std::ffi::OsStr>) -> Option<&'static str> {
    current.is_none().then_some("1")
}

/// Call first in `run`, before any thread starts and before GTK loads.
pub fn configure() {
    // A value the user set wins.
    for name in WEBKIT_SWITCHES {
        if let Some(value) = switch_default(std::env::var_os(name).as_deref()) {
            std::env::set_var(name, value);
        }
    }
    // At most two malloc arenas: the scan and player threads share freed memory instead of
    // keeping one arena each.
    // SAFETY: mallopt only sets an allocator option, here before other threads exist.
    unsafe { libc::mallopt(libc::M_ARENA_MAX, 2) };
}

/// Gives freed heap pages back to the system, after work that frees much (a scan).
pub fn trim() {
    // SAFETY: malloc_trim only releases free pages.
    unsafe { libc::malloc_trim(0) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_switch_is_off_unless_the_user_set_it() {
        assert_eq!(switch_default(None), Some("1"));
        assert_eq!(switch_default(Some("0".as_ref())), None);
    }
}
