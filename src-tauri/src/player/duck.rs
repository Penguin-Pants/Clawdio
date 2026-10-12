//! Microphone ducking (P20.3, R34.4 to R34.6, D52): what "microphone busy", "microphone
//! free", a setting change and the user's transport commands do to the music. The state
//! machine is pure: the caller passes the time, so tests use a fake clock. The output gain
//! is the user volume times the duck factor; this module owns the factor only, so the volume
//! control and the saved volume always show the user volume (R34.6).

use std::time::{Duration, Instant};

use clawdio_core::api::MicDucking;

/// D52: the volume fades down in 150 ms.
pub const FADE_DOWN: Duration = Duration::from_millis(150);
/// D52: after the microphone is free, the duck stays 1 s.
pub const WAIT: Duration = Duration::from_secs(1);
/// D52: then the volume fades up, or playback resumes with a fade in, in 500 ms.
pub const FADE_UP: Duration = Duration::from_millis(500);

/// A linear change of the duck factor (D52), read by the output per block of samples.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ramp {
    from: f32,
    to: f32,
    start: Instant,
    over: Duration,
}

impl Ramp {
    /// A factor that does not change.
    pub fn flat(value: f32, now: Instant) -> Self {
        Ramp {
            from: value,
            to: value,
            start: now,
            over: Duration::ZERO,
        }
    }

    /// From `from` to `to`, starting at `start`, over `over`.
    pub fn new(from: f32, to: f32, start: Instant, over: Duration) -> Self {
        Ramp {
            from,
            to,
            start,
            over,
        }
    }

    /// The factor at `now`.
    pub fn at(&self, now: Instant) -> f32 {
        let elapsed = now.saturating_duration_since(self.start);
        if elapsed >= self.over {
            return self.to;
        }
        let done = elapsed.as_secs_f32() / self.over.as_secs_f32();
        self.from + (self.to - self.from) * done
    }

    /// When the ramp reaches its target.
    #[cfg(test)]
    pub fn end(&self) -> Instant {
        self.start + self.over
    }
}

/// What the player does for the duck.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Action {
    /// Fade the duck factor to `to` over `over`, from `from`, or from the current factor.
    Fade {
        from: Option<f32>,
        to: f32,
        over: Duration,
    },
    /// Pause playback (Pause mode). Only the duck resumes it.
    Pause,
    /// Resume playback that the duck paused.
    Resume,
}

fn fade(to: f32, over: Duration) -> Action {
    Action::Fade {
        from: None,
        to,
        over,
    }
}

/// The duck state (R34, D52).
#[derive(Debug)]
pub struct Duck {
    mode: MicDucking,
    /// The ducked factor in Lower volume mode (R34.3).
    factor: f32,
    /// Another app records from a microphone, as last reported. Kept in Off mode too, so a
    /// setting that leaves Off ducks at once.
    busy: bool,
    /// The duck is in effect: the microphone is busy, or free for less than [`WAIT`].
    ducking: bool,
    /// When the duck ends after "microphone free".
    release_at: Option<Instant>,
    /// When the fade down ends and the Pause mode pauses.
    pause_at: Option<Instant>,
    /// The duck paused playback: only this flag resumes it (R34.4).
    paused: bool,
    /// The user pressed Play during a Pause duck: no new pause until the next microphone
    /// start (requirements section 5).
    blocked: bool,
}

impl Default for Duck {
    fn default() -> Self {
        Duck {
            mode: MicDucking::Off,
            factor: 0.2,
            busy: false,
            ducking: false,
            release_at: None,
            pause_at: None,
            paused: false,
            blocked: false,
        }
    }
}

impl Duck {
    /// True while the duck holds playback paused: a track change keeps it paused (E-35).
    pub fn holds_pause(&self) -> bool {
        self.paused
    }

    /// The next time [`Duck::poll`] has work.
    pub fn next_deadline(&self) -> Option<Instant> {
        match (self.pause_at, self.release_at) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        }
    }

    /// Starts the duck in the current mode.
    fn engage(&mut self, now: Instant, playing: bool) -> Vec<Action> {
        match self.mode {
            MicDucking::Off => Vec::new(),
            MicDucking::Lower => vec![fade(self.factor, FADE_DOWN)],
            MicDucking::Pause if playing && !self.blocked && !self.paused => {
                self.pause_at = Some(now + FADE_DOWN);
                vec![fade(0.0, FADE_DOWN)]
            }
            MicDucking::Pause => Vec::new(),
        }
    }

    /// Ends the duck: the volume fades back, or a duck-paused track resumes with a fade in.
    fn end(&mut self) -> Vec<Action> {
        self.ducking = false;
        self.release_at = None;
        self.blocked = false;
        let pending = self.pause_at.take().is_some();
        match self.mode {
            MicDucking::Off => Vec::new(),
            MicDucking::Lower => vec![fade(1.0, FADE_UP)],
            MicDucking::Pause if self.paused => {
                self.paused = false;
                vec![
                    Action::Fade {
                        from: Some(0.0),
                        to: 1.0,
                        over: FADE_UP,
                    },
                    Action::Resume,
                ]
            }
            MicDucking::Pause if pending => vec![fade(1.0, FADE_UP)],
            MicDucking::Pause => Vec::new(),
        }
    }

    /// "Microphone busy" (R34.2).
    pub fn busy(&mut self, now: Instant, playing: bool) -> Vec<Action> {
        if self.busy {
            return Vec::new();
        }
        self.busy = true;
        // A new microphone start: Play during an earlier Pause duck no longer blocks.
        self.blocked = false;
        if self.mode == MicDucking::Off {
            return Vec::new();
        }
        if self.ducking {
            // Busy again during the wait: the duck stays (R34.5).
            self.release_at = None;
            return self.engage_pause_again(now, playing);
        }
        self.ducking = true;
        self.engage(now, playing)
    }

    /// Pause mode, busy during the wait after a Play that unblocked: pause again.
    fn engage_pause_again(&mut self, now: Instant, playing: bool) -> Vec<Action> {
        if self.mode == MicDucking::Pause && self.pause_at.is_none() {
            return self.engage(now, playing);
        }
        Vec::new()
    }

    /// "Microphone free": the duck ends after [`WAIT`] (R34.5).
    pub fn free(&mut self, now: Instant) -> Vec<Action> {
        if !self.busy {
            return Vec::new();
        }
        self.busy = false;
        if self.ducking {
            self.release_at = Some(now + WAIT);
        }
        Vec::new()
    }

    /// The timers: the pause after the fade down, and the end of the wait.
    pub fn poll(&mut self, now: Instant, playing: bool) -> Vec<Action> {
        let mut actions = Vec::new();
        if self.pause_at.is_some_and(|at| at <= now) {
            self.pause_at = None;
            if playing {
                self.paused = true;
                actions.push(Action::Pause);
            }
            // Paused or not, the user volume is back for the next Play.
            actions.push(fade(1.0, Duration::ZERO));
        }
        if self.release_at.is_some_and(|at| at <= now) {
            actions.extend(self.end());
        }
        actions
    }

    /// A settings change (R34.1, R34.3). A change to Off ends an active duck; a change between
    /// Lower volume and Pause applies at once (requirements section 5).
    pub fn set(
        &mut self,
        mode: MicDucking,
        percent: u8,
        now: Instant,
        playing: bool,
    ) -> Vec<Action> {
        let factor = f32::from(percent) / 100.0;
        let old = self.mode;
        let factor_changed = (factor - self.factor).abs() > f32::EPSILON;
        self.factor = factor;
        if mode == old {
            return if mode == MicDucking::Lower && self.ducking && factor_changed {
                vec![fade(factor, FADE_DOWN)]
            } else {
                Vec::new()
            };
        }
        if !self.ducking {
            self.mode = mode;
            if self.busy && mode != MicDucking::Off {
                self.ducking = true;
                return self.engage(now, playing);
            }
            return Vec::new();
        }
        match (old, mode) {
            (_, MicDucking::Off) => {
                let actions = self.end();
                self.mode = MicDucking::Off;
                actions
            }
            (MicDucking::Lower, MicDucking::Pause) => {
                self.mode = mode;
                let mut actions = Vec::new();
                if playing && !self.blocked {
                    self.paused = true;
                    actions.push(Action::Pause);
                }
                actions.push(fade(1.0, Duration::ZERO));
                actions
            }
            (MicDucking::Pause, MicDucking::Lower) => {
                self.mode = mode;
                self.pause_at = None;
                if std::mem::take(&mut self.paused) {
                    vec![fade(factor, Duration::ZERO), Action::Resume]
                } else {
                    vec![fade(factor, FADE_DOWN)]
                }
            }
            // `ducking` is never true in Off mode, and equal modes returned above.
            _ => {
                self.mode = mode;
                Vec::new()
            }
        }
    }

    /// The user pressed Play (or a new list plays). During a Pause duck playback continues,
    /// and no new pause comes until the next microphone start.
    pub fn user_play(&mut self) -> Vec<Action> {
        self.paused = false;
        if self.mode == MicDucking::Pause && self.ducking {
            self.blocked = true;
        }
        Vec::new()
    }

    /// The user paused or stopped: the duck no longer resumes playback (R34.4).
    pub fn user_halt(&mut self) -> Vec<Action> {
        self.paused = false;
        if self.pause_at.take().is_some() {
            return vec![fade(1.0, Duration::ZERO)];
        }
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fake clock: a start time and an offset.
    struct Clock(Instant);

    impl Clock {
        fn at(&self, ms: u64) -> Instant {
            self.0 + Duration::from_millis(ms)
        }
    }

    fn clock() -> Clock {
        Clock(Instant::now())
    }

    fn duck(mode: MicDucking) -> Duck {
        let mut duck = Duck::default();
        let _ = duck.set(mode, 20, Instant::now(), true);
        duck
    }

    const DOWN_TO_20: Action = Action::Fade {
        from: None,
        to: 0.2,
        over: FADE_DOWN,
    };
    const UP: Action = Action::Fade {
        from: None,
        to: 1.0,
        over: FADE_UP,
    };
    const BACK: Action = Action::Fade {
        from: None,
        to: 1.0,
        over: Duration::ZERO,
    };
    const FADE_IN: Action = Action::Fade {
        from: Some(0.0),
        to: 1.0,
        over: FADE_UP,
    };

    #[test]
    fn off_ignores_busy_and_free() {
        let c = clock();
        let mut duck = duck(MicDucking::Off);
        assert_eq!(duck.busy(c.at(0), true), []);
        assert_eq!(duck.poll(c.at(500), true), []);
        assert_eq!(duck.free(c.at(600)), []);
        assert_eq!(duck.poll(c.at(5000), true), []);
        assert_eq!(duck.next_deadline(), None);
    }

    #[test]
    fn lower_fades_down_waits_one_second_then_fades_up() {
        let c = clock();
        let mut duck = duck(MicDucking::Lower);
        assert_eq!(duck.busy(c.at(0), true), [DOWN_TO_20]);
        assert_eq!(duck.free(c.at(2000)), []);
        assert_eq!(duck.next_deadline(), Some(c.at(3000)));
        assert_eq!(duck.poll(c.at(2999), true), [], "the wait is 1 s");
        assert_eq!(duck.poll(c.at(3000), true), [UP]);
        assert_eq!(duck.next_deadline(), None);
    }

    #[test]
    fn busy_again_during_the_wait_keeps_the_duck() {
        let c = clock();
        let mut duck = duck(MicDucking::Lower);
        duck.busy(c.at(0), true);
        duck.free(c.at(1000));
        assert_eq!(duck.busy(c.at(1500), true), [], "no new fade");
        assert_eq!(duck.poll(c.at(2000), true), [], "the old wait is gone");
        duck.free(c.at(3000));
        assert_eq!(duck.poll(c.at(4000), true), [UP]);
    }

    #[test]
    fn pause_fades_down_pauses_and_resumes_with_a_fade_in() {
        let c = clock();
        let mut duck = duck(MicDucking::Pause);
        assert_eq!(
            duck.busy(c.at(0), true),
            [Action::Fade {
                from: None,
                to: 0.0,
                over: FADE_DOWN
            }]
        );
        assert_eq!(duck.poll(c.at(149), true), []);
        assert_eq!(duck.poll(c.at(150), true), [Action::Pause, BACK]);
        assert!(duck.holds_pause());
        duck.free(c.at(2000));
        assert_eq!(duck.poll(c.at(3000), false), [FADE_IN, Action::Resume]);
        assert!(!duck.holds_pause());
    }

    #[test]
    fn busy_while_stopped_or_paused_by_the_user_does_nothing() {
        let c = clock();
        let mut duck = duck(MicDucking::Pause);
        assert_eq!(duck.busy(c.at(0), false), []);
        duck.free(c.at(100));
        assert_eq!(duck.poll(c.at(1100), false), [], "nothing to resume");
        let mut lower = self::duck(MicDucking::Lower);
        assert_eq!(
            lower.busy(c.at(0), false),
            [DOWN_TO_20],
            "a later Play plays at the ducked volume"
        );
    }

    /// Requirements section 5: Play during a Pause duck plays on; no new pause until the
    /// microphone is free and starts again.
    #[test]
    fn play_during_a_pause_duck_plays_until_the_next_microphone_start() {
        let c = clock();
        let mut duck = duck(MicDucking::Pause);
        duck.busy(c.at(0), true);
        duck.poll(c.at(150), true);
        assert_eq!(duck.user_play(), []);
        assert!(!duck.holds_pause());
        assert_eq!(duck.poll(c.at(500), true), [], "no pause again");
        duck.free(c.at(1000));
        assert_eq!(duck.poll(c.at(2000), true), [], "nothing to resume");
        assert_eq!(
            duck.busy(c.at(3000), true),
            [Action::Fade {
                from: None,
                to: 0.0,
                over: FADE_DOWN
            }],
            "the next microphone start pauses again"
        );
    }

    /// E-38: Stop during a Pause duck: no resume when the microphone is free.
    #[test]
    fn stop_or_a_user_pause_during_a_pause_duck_clears_the_flag() {
        let c = clock();
        let mut duck = duck(MicDucking::Pause);
        duck.busy(c.at(0), true);
        duck.poll(c.at(150), true);
        assert_eq!(duck.user_halt(), []);
        duck.free(c.at(500));
        assert_eq!(duck.poll(c.at(1500), false), []);
        // A user pause during the fade down: the gain comes back, no duck pause follows.
        duck.busy(c.at(2000), true);
        assert_eq!(duck.user_halt(), [BACK]);
        assert_eq!(duck.poll(c.at(2200), false), []);
    }

    /// E-37: a change to Off ends an active duck.
    #[test]
    fn a_change_to_off_ends_the_duck() {
        let c = clock();
        let mut lower = duck(MicDucking::Lower);
        lower.busy(c.at(0), true);
        assert_eq!(lower.set(MicDucking::Off, 20, c.at(100), true), [UP]);
        assert_eq!(lower.free(c.at(200)), []);
        assert_eq!(lower.poll(c.at(5000), true), []);
        let mut pause = duck(MicDucking::Pause);
        pause.busy(c.at(0), true);
        pause.poll(c.at(150), true);
        assert_eq!(
            pause.set(MicDucking::Off, 20, c.at(300), false),
            [FADE_IN, Action::Resume]
        );
    }

    /// E-39: a mode change during a duck applies at once.
    #[test]
    fn a_mode_change_during_a_duck_applies_at_once() {
        let c = clock();
        let mut duck = duck(MicDucking::Lower);
        duck.busy(c.at(0), true);
        assert_eq!(
            duck.set(MicDucking::Pause, 20, c.at(500), true),
            [Action::Pause, BACK],
            "pause, gain back to the user volume"
        );
        assert_eq!(
            duck.set(MicDucking::Lower, 20, c.at(800), false),
            [
                Action::Fade {
                    from: None,
                    to: 0.2,
                    over: Duration::ZERO
                },
                Action::Resume
            ],
            "resume at the ducked gain"
        );
        assert_eq!(
            duck.set(MicDucking::Lower, 50, c.at(900), true),
            [Action::Fade {
                from: None,
                to: 0.5,
                over: FADE_DOWN
            }],
            "a new percentage applies"
        );
    }

    #[test]
    fn leaving_off_while_busy_ducks_at_once() {
        let c = clock();
        let mut duck = duck(MicDucking::Off);
        duck.busy(c.at(0), true);
        assert_eq!(
            duck.set(MicDucking::Lower, 20, c.at(10), true),
            [DOWN_TO_20]
        );
    }

    /// D52 gain values: start, middle, end and duration, and a fade that another event
    /// interrupts.
    #[test]
    fn ramps_are_linear_and_an_interrupted_fade_starts_from_where_it_was() {
        let c = clock();
        let down = Ramp::new(1.0, 0.2, c.at(0), FADE_DOWN);
        assert_eq!(down.at(c.at(0)), 1.0);
        assert!((down.at(c.at(75)) - 0.6).abs() < 1e-4);
        assert_eq!(down.at(c.at(150)), 0.2);
        assert_eq!(down.end(), c.at(150));
        let up = Ramp::new(0.2, 1.0, c.at(1000), FADE_UP);
        assert!((up.at(c.at(1250)) - 0.6).abs() < 1e-4);
        assert_eq!(up.at(c.at(1500)), 1.0);
        assert_eq!(up.end() - c.at(1000), FADE_UP);
        // Busy again at 1100 ms: the next fade starts from the factor at that time.
        let now = up.at(c.at(1100));
        assert!((now - 0.36).abs() < 1e-4);
        let again = Ramp::new(now, 0.2, c.at(1100), FADE_DOWN);
        assert!((again.at(c.at(1175)) - 0.28).abs() < 1e-4);
        assert_eq!(Ramp::flat(0.5, c.at(0)).at(c.at(9)), 0.5);
    }
}
