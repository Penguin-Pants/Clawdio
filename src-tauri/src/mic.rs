//! Microphone detector (P20.2, R34.2): tells the player "microphone busy" while any other app
//! records from a microphone, and "microphone free" when none does. The app never opens a
//! capture stream and never measures sound. It logs state changes and errors only, never an
//! app name, path or id (P20-AC6). Windows only (R34); Linux builds hold no detector code.
//!
//! P20.0 (K21) chooses the signal. Both candidates are here, and `examples/mic_probe.rs`
//! prints them side by side for the owner's test. The detector uses the audio sessions of the
//! capture endpoints until the probe result says otherwise.

/// The busy or free state from a count of other apps that record (P20-AC7). One app that stops
/// while another records changes nothing.
#[derive(Debug, Default)]
pub struct Aggregate {
    busy: bool,
}

impl Aggregate {
    /// The new state when it changed: `Some(true)` for busy, `Some(false)` for free.
    pub fn update(&mut self, recording: usize) -> Option<bool> {
        let busy = recording > 0;
        (busy != self.busy).then(|| {
            self.busy = busy;
            busy
        })
    }

    /// Forgets the state (the setting went to Off): `Some(false)` when it was busy.
    pub fn reset(&mut self) -> Option<bool> {
        std::mem::take(&mut self.busy).then_some(false)
    }
}

/// A signal that counts the other apps that record from a microphone now.
pub trait MicSource {
    fn recording(&mut self) -> Result<usize, String>;
}

#[cfg(windows)]
pub use windows_impl::{spawn, ConsentStore, MicControl, WasapiSessions};

#[cfg(windows)]
mod windows_impl {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use windows::core::{Interface, PCWSTR, PWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::Media::Audio::{
        eCapture, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ,
    };
    use windows::Win32::System::Threading::GetCurrentProcessId;

    use super::{Aggregate, MicSource};
    use crate::player::{Command, PlayerHandle};

    /// How often the detector reads the signal.
    const POLL: Duration = Duration::from_millis(250);

    /// Candidate 1: the active audio sessions on the active capture endpoints, other than this
    /// process. Reading the session list opens no capture stream.
    pub struct WasapiSessions {
        own: u32,
    }

    impl WasapiSessions {
        /// Starts COM on the calling thread (multithreaded apartment).
        pub fn new() -> Self {
            // S_FALSE (already started) is fine; a real failure shows in `recording`.
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            WasapiSessions {
                own: unsafe { GetCurrentProcessId() },
            }
        }
    }

    impl Default for WasapiSessions {
        fn default() -> Self {
            Self::new()
        }
    }

    impl MicSource for WasapiSessions {
        fn recording(&mut self) -> Result<usize, String> {
            let error = |e: windows::core::Error| e.message();
            let mut count = 0;
            unsafe {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(error)?;
                let devices = enumerator
                    .EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
                    .map_err(error)?;
                for index in 0..devices.GetCount().map_err(error)? {
                    let device = devices.Item(index).map_err(error)?;
                    let manager: IAudioSessionManager2 =
                        device.Activate(CLSCTX_ALL, None).map_err(error)?;
                    let sessions = manager.GetSessionEnumerator().map_err(error)?;
                    for session in 0..sessions.GetCount().map_err(error)? {
                        let control = sessions.GetSession(session).map_err(error)?;
                        if control.GetState().map_err(error)? != AudioSessionStateActive {
                            continue;
                        }
                        let control: IAudioSessionControl2 = control.cast().map_err(error)?;
                        // The system sounds session has process id 0.
                        let process = control.GetProcessId().unwrap_or(0);
                        if process != 0 && process != self.own {
                            count += 1;
                        }
                    }
                }
            }
            Ok(count)
        }
    }

    /// Candidate 2: the privacy consent store. An app records while its `LastUsedTimeStop` is
    /// 0 (packaged apps directly under the key, desktop apps under `NonPackaged`).
    pub struct ConsentStore {
        /// This app's key name under `NonPackaged`: its path with `#` for `\`.
        own: Option<String>,
    }

    const MICROPHONE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    struct Key(HKEY);

    impl Drop for Key {
        fn drop(&mut self) {
            let _ = unsafe { RegCloseKey(self.0) };
        }
    }

    fn open(parent: HKEY, name: &str) -> Option<Key> {
        let name = wide(name);
        let mut key = HKEY::default();
        let status =
            unsafe { RegOpenKeyExW(parent, PCWSTR(name.as_ptr()), None, KEY_READ, &mut key) };
        (status == ERROR_SUCCESS).then_some(Key(key))
    }

    fn subkeys(key: &Key) -> Vec<String> {
        let mut names = Vec::new();
        let mut buffer = [0u16; 1024];
        for index in 0.. {
            let mut length = buffer.len() as u32;
            let status = unsafe {
                RegEnumKeyExW(
                    key.0,
                    index,
                    Some(PWSTR(buffer.as_mut_ptr())),
                    &mut length,
                    None,
                    None,
                    None,
                    None,
                )
            };
            if status != ERROR_SUCCESS {
                break;
            }
            names.push(String::from_utf16_lossy(&buffer[..length as usize]));
        }
        names
    }

    /// The QWORD value `name`, or None.
    fn qword(key: &Key, name: &str) -> Option<u64> {
        let name = wide(name);
        let mut value = 0u64;
        let mut size = std::mem::size_of::<u64>() as u32;
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                None,
                Some((&mut value as *mut u64).cast()),
                Some(&mut size),
            )
        };
        (status == ERROR_SUCCESS).then_some(value)
    }

    fn in_use(key: &Key) -> bool {
        qword(key, "LastUsedTimeStart").is_some_and(|start| start != 0)
            && qword(key, "LastUsedTimeStop") == Some(0)
    }

    impl ConsentStore {
        pub fn new() -> Self {
            let own = std::env::current_exe()
                .ok()
                .map(|path| path.to_string_lossy().replace('\\', "#").to_lowercase());
            ConsentStore { own }
        }
    }

    impl Default for ConsentStore {
        fn default() -> Self {
            Self::new()
        }
    }

    impl MicSource for ConsentStore {
        fn recording(&mut self) -> Result<usize, String> {
            let root = open(HKEY_CURRENT_USER, MICROPHONE)
                .ok_or_else(|| "the microphone consent store cannot be read".to_owned())?;
            let mut count = 0;
            for name in subkeys(&root) {
                if name == "NonPackaged" {
                    let Some(desktop) = open(root.0, &name) else {
                        continue;
                    };
                    for app in subkeys(&desktop) {
                        if self.own.as_deref() == Some(app.to_lowercase().as_str()) {
                            continue;
                        }
                        if open(desktop.0, &app).is_some_and(|key| in_use(&key)) {
                            count += 1;
                        }
                    }
                } else if open(root.0, &name).is_some_and(|key| in_use(&key)) {
                    count += 1;
                }
            }
            Ok(count)
        }
    }

    /// Turns the detector on and off with the setting. Off sends "microphone free" when the
    /// state was busy, so the duck never keeps a stale state.
    #[derive(Clone)]
    pub struct MicControl {
        enabled: Arc<AtomicBool>,
    }

    impl MicControl {
        pub fn set_enabled(&self, on: bool) {
            self.enabled.store(on, Ordering::Relaxed);
        }
    }

    /// Starts the detector thread. It reads the signal at once when enabled, so a microphone
    /// that is already in use ducks at once.
    pub fn spawn(player: PlayerHandle, enabled: bool) -> MicControl {
        let control = MicControl {
            enabled: Arc::new(AtomicBool::new(enabled)),
        };
        let on = control.enabled.clone();
        let started = std::thread::Builder::new()
            .name("mic".into())
            .spawn(move || {
                let mut source = WasapiSessions::new();
                let mut state = Aggregate::default();
                let mut failing = false;
                loop {
                    let change = if on.load(Ordering::Relaxed) {
                        match source.recording() {
                            Ok(count) => {
                                failing = false;
                                state.update(count)
                            }
                            Err(error) => {
                                if !std::mem::replace(&mut failing, true) {
                                    log::warn!(
                                        "ducking: cannot read the capture sessions: {error}"
                                    );
                                }
                                None
                            }
                        }
                    } else {
                        state.reset()
                    };
                    match change {
                        Some(true) => player.send(Command::MicBusy),
                        Some(false) => player.send(Command::MicFree),
                        None => {}
                    }
                    std::thread::sleep(POLL);
                }
            });
        if let Err(error) = started {
            log::warn!("ducking: the detector cannot start: {error}");
        }
        control
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake signal: the apps that record, by name.
    struct Fake(Vec<&'static str>);

    impl MicSource for Fake {
        fn recording(&mut self) -> Result<usize, String> {
            Ok(self.0.len())
        }
    }

    fn step(state: &mut Aggregate, source: &mut Fake) -> Option<bool> {
        state.update(source.recording().unwrap())
    }

    /// P20-AC7: two overlapping users; the first stops (still busy), the second stops (free).
    #[test]
    fn busy_while_any_other_app_records() {
        let mut state = Aggregate::default();
        let mut source = Fake(vec![]);
        assert_eq!(step(&mut state, &mut source), None);
        source.0.push("call");
        assert_eq!(step(&mut state, &mut source), Some(true));
        source.0.push("dictation");
        assert_eq!(step(&mut state, &mut source), None);
        source.0.retain(|app| *app != "call");
        assert_eq!(step(&mut state, &mut source), None, "still busy");
        source.0.clear();
        assert_eq!(step(&mut state, &mut source), Some(false));
    }

    /// P20-AC7: a user already active at start gives busy at once.
    #[test]
    fn a_user_active_at_start_gives_busy_at_once() {
        let mut state = Aggregate::default();
        assert_eq!(step(&mut state, &mut Fake(vec!["call"])), Some(true));
    }

    #[test]
    fn reset_frees_a_busy_state_once() {
        let mut state = Aggregate::default();
        state.update(1);
        assert_eq!(state.reset(), Some(false));
        assert_eq!(state.reset(), None);
        assert_eq!(state.update(1), Some(true), "busy again after Off");
    }
}
