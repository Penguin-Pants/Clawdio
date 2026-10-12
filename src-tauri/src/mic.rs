//! Microphone detector (P20.2, R34.2): tells the player "microphone busy" while any other app
//! records from a microphone, and "microphone free" when none does. The app never opens a
//! capture stream and never measures sound. It logs state changes and errors only, never an
//! app name, path or id (P20-AC6). Windows only (R34); Linux builds hold no detector code.
//!
//! The signal (D54): the active audio sessions on the active capture endpoints, other than
//! this process. The P20.0 probe showed it follows Handy and a WhatsApp call.

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
pub use windows_impl::{spawn, MicControl};

#[cfg(windows)]
mod windows_impl {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use windows::core::Interface;
    use windows::Win32::Media::Audio::{
        eCapture, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::GetCurrentProcessId;

    use super::{Aggregate, MicSource};
    use crate::player::{Command, PlayerHandle};

    /// How often the detector reads the signal.
    const POLL: Duration = Duration::from_millis(250);

    /// The active audio sessions on the active capture endpoints, other than this process
    /// (D54). Reading the session list opens no capture stream.
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
