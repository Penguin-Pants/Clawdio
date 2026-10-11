//! The play queue (P7.1): a pure state machine for R6. The player thread owns it (D46).
//! It decides what plays; the engine plays it.

use crate::api::{QueueSnapshot, RepeatMode};
use crate::library::TrackId;

/// Previous restarts the current entry after this much of it played (R6).
pub const PREVIOUS_RESTART_MS: u32 = 3_000;

/// What the engine does after a queue operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Play the entry at this index from its start.
    Play(usize),
    /// Play the current entry again from its start.
    Restart,
    /// Stop at position 0. The current entry stays current.
    Stop,
}

/// What removing an entry means for playback.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Removed {
    /// Nothing removed (index out of range).
    Nothing,
    /// Another entry went; the playing song and its position stay.
    Kept,
    /// The current entry went: the engine does this.
    Current(Step),
}

/// A small deterministic random source (xorshift64*), so tests can fix the order.
#[derive(Debug, Clone)]
struct Random(u64);

impl Random {
    fn new(seed: u64) -> Self {
        Random(seed.max(1))
    }

    fn below(&mut self, bound: usize) -> usize {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 33) as usize % bound.max(1)
    }
}

/// The queue: entries in display order, the current entry, and the play order state.
#[derive(Debug, Clone)]
pub struct Queue {
    entries: Vec<TrackId>,
    current: Option<usize>,
    shuffle: bool,
    repeat: RepeatMode,
    /// Shuffle: entries played in this run, for Previous.
    history: Vec<usize>,
    /// Shuffle: entries not yet played in this cycle.
    pool: Vec<usize>,
    random: Random,
}

impl Queue {
    /// An empty queue. `seed` fixes the shuffle order (tests); the app passes the time.
    pub fn new(seed: u64) -> Self {
        Queue {
            entries: Vec::new(),
            current: None,
            shuffle: false,
            repeat: RepeatMode::Off,
            history: Vec::new(),
            pool: Vec::new(),
            random: Random::new(seed),
        }
    }

    pub fn snapshot(&self) -> QueueSnapshot {
        QueueSnapshot {
            entries: self.entries.clone(),
            current: self.current.map(|index| index as u32),
        }
    }

    pub fn entries(&self) -> &[TrackId] {
        &self.entries
    }

    pub fn current(&self) -> Option<usize> {
        self.current
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    pub fn repeat(&self) -> RepeatMode {
        self.repeat
    }

    /// Replaces the entries and makes `start` current (R6: Play and double-click replace).
    /// Returns `start`, or None when it is outside the list.
    pub fn replace(&mut self, entries: Vec<TrackId>, start: usize) -> Option<usize> {
        if start >= entries.len() {
            return None;
        }
        self.entries = entries;
        self.current = Some(start);
        self.history.clear();
        self.refill_pool();
        Some(start)
    }

    /// Appends entries (Add to queue). The playing song does not change. During shuffle the
    /// new entries join the remaining pool.
    pub fn append(&mut self, ids: &[TrackId]) {
        let first = self.entries.len();
        self.entries.extend_from_slice(ids);
        if self.shuffle {
            self.pool.extend(first..self.entries.len());
        }
    }

    /// Removes the entry at `index`. Removing the playing entry plays the next one, or stops
    /// at the end; removing another keeps the song and its position.
    pub fn remove(&mut self, index: usize) -> Removed {
        if index >= self.entries.len() {
            return Removed::Nothing;
        }
        self.entries.remove(index);
        let shift = |list: &mut Vec<usize>| {
            list.retain(|&entry| entry != index);
            for entry in list.iter_mut() {
                if *entry > index {
                    *entry -= 1;
                }
            }
        };
        shift(&mut self.history);
        shift(&mut self.pool);
        let Some(current) = self.current else {
            return Removed::Kept;
        };
        if index < current {
            self.current = Some(current - 1);
            return Removed::Kept;
        }
        if index > current {
            return Removed::Kept;
        }
        // The playing entry went.
        if self.entries.is_empty() {
            self.current = None;
            return Removed::Current(Step::Stop);
        }
        if self.shuffle {
            if let Some(next) = self.take_from_pool(None) {
                self.current = Some(next);
                return Removed::Current(Step::Play(next));
            }
            self.current = Some(index.min(self.entries.len() - 1));
            return Removed::Current(Step::Stop);
        }
        if index < self.entries.len() {
            self.current = Some(index);
            Removed::Current(Step::Play(index))
        } else {
            self.current = Some(self.entries.len() - 1);
            Removed::Current(Step::Stop)
        }
    }

    /// Empties the queue.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.current = None;
        self.history.clear();
        self.pool.clear();
    }

    /// Next (the user). Repeat one still moves.
    // The plan names this operation `next` (P7.1); the queue is not an iterator.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> Step {
        let Some(current) = self.current else {
            return Step::Stop;
        };
        let next = if self.shuffle {
            if self.pool.is_empty() && self.repeat == RepeatMode::All {
                self.pool = (0..self.entries.len()).collect();
            }
            self.take_from_pool(Some(current))
        } else if current + 1 < self.entries.len() {
            Some(current + 1)
        } else if self.repeat == RepeatMode::All {
            Some(0)
        } else {
            None
        };
        match next {
            Some(next) => {
                self.history.push(current);
                self.current = Some(next);
                Step::Play(next)
            }
            None => Step::Stop,
        }
    }

    /// Previous (the user) at `position_ms` into the current entry: over 3 s it restarts the
    /// entry; else it goes to the previous entry in play order, or restarts when there is none.
    pub fn previous(&mut self, position_ms: u32) -> Step {
        let Some(current) = self.current else {
            return Step::Stop;
        };
        if position_ms > PREVIOUS_RESTART_MS {
            return Step::Restart;
        }
        let previous = if self.shuffle {
            let previous = self.history.pop();
            if previous.is_some() {
                // The entry left behind can play again in this cycle.
                self.pool.push(current);
            }
            previous
        } else {
            current.checked_sub(1)
        };
        match previous {
            Some(previous) => {
                self.current = Some(previous);
                Step::Play(previous)
            }
            None => Step::Restart,
        }
    }

    /// The current entry ended.
    pub fn on_end(&mut self) -> Step {
        if self.current.is_some() && self.repeat == RepeatMode::One {
            return Step::Restart;
        }
        self.next()
    }

    /// Shuffle on: a random order over the entries not played yet. Off: queue order from the
    /// current entry.
    pub fn set_shuffle(&mut self, on: bool) {
        self.shuffle = on;
        self.history.clear();
        self.refill_pool();
    }

    pub fn set_repeat(&mut self, mode: RepeatMode) {
        self.repeat = mode;
    }

    /// With shuffle on: every entry but the current one is still to play.
    fn refill_pool(&mut self) {
        self.pool = if self.shuffle {
            (0..self.entries.len())
                .filter(|&index| Some(index) != self.current)
                .collect()
        } else {
            Vec::new()
        };
    }

    /// Takes a random entry from the pool. A new cycle does not start with `avoid` (the entry
    /// that just played) when another entry is left.
    fn take_from_pool(&mut self, avoid: Option<usize>) -> Option<usize> {
        if self.pool.is_empty() {
            return None;
        }
        let mut pick = self.random.below(self.pool.len());
        if Some(self.pool[pick]) == avoid && self.pool.len() > 1 {
            pick = (pick + 1) % self.pool.len();
        }
        Some(self.pool.swap_remove(pick))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn queue(len: u32, start: usize) -> Queue {
        let mut queue = Queue::new(7);
        queue.replace((100..100 + len).collect(), start);
        queue
    }

    #[test]
    fn replace_makes_the_start_entry_current() {
        let mut queue = Queue::new(1);
        assert_eq!(queue.replace(vec![5, 6, 7], 1), Some(1));
        assert_eq!(
            queue.snapshot(),
            QueueSnapshot {
                entries: vec![5, 6, 7],
                current: Some(1)
            }
        );
        assert_eq!(
            queue.replace(vec![5], 3),
            None,
            "a start outside the list plays nothing"
        );
    }

    #[test]
    fn repeat_off_stops_after_the_last_entry_with_it_current() {
        let mut queue = queue(3, 1);
        assert_eq!(queue.on_end(), Step::Play(2));
        assert_eq!(queue.on_end(), Step::Stop);
        assert_eq!(queue.current(), Some(2));
        assert_eq!(queue.next(), Step::Stop, "Next at the end stops too");
    }

    #[test]
    fn repeat_all_continues_from_the_first_entry() {
        let mut queue = queue(3, 2);
        queue.set_repeat(RepeatMode::All);
        assert_eq!(queue.on_end(), Step::Play(0));
        assert_eq!(queue.current(), Some(0));
    }

    #[test]
    fn repeat_one_restarts_on_end_but_next_and_previous_move() {
        let mut queue = queue(3, 1);
        queue.set_repeat(RepeatMode::One);
        assert_eq!(queue.on_end(), Step::Restart);
        assert_eq!(queue.current(), Some(1));
        assert_eq!(queue.next(), Step::Play(2));
        assert_eq!(queue.previous(0), Step::Play(1));
    }

    #[test]
    fn previous_restarts_after_three_seconds_and_else_goes_back() {
        let mut queue = queue(3, 1);
        assert_eq!(queue.previous(3_001), Step::Restart);
        assert_eq!(queue.previous(3_000), Step::Play(0));
        assert_eq!(queue.previous(0), Step::Restart, "the first entry restarts");
        assert_eq!(queue.current(), Some(0));
    }

    #[test]
    fn shuffle_previous_returns_to_the_last_entry_played() {
        let mut queue = queue(6, 0);
        queue.set_shuffle(true);
        let Step::Play(second) = queue.next() else {
            panic!("plays")
        };
        let Step::Play(third) = queue.next() else {
            panic!("plays")
        };
        assert_ne!(second, third);
        assert_eq!(queue.previous(0), Step::Play(second));
        assert_eq!(queue.previous(0), Step::Play(0));
        assert_eq!(
            queue.previous(0),
            Step::Restart,
            "nothing played before the first"
        );
    }

    #[test]
    fn shuffle_keeps_the_display_order_and_off_continues_in_queue_order() {
        let mut queue = queue(6, 2);
        queue.set_shuffle(true);
        let before = queue.entries().to_vec();
        let Step::Play(next) = queue.next() else {
            panic!("plays")
        };
        assert_eq!(queue.entries(), before, "the display order does not change");
        queue.set_shuffle(false);
        let expected = if next + 1 < 6 {
            Step::Play(next + 1)
        } else {
            Step::Stop
        };
        assert_eq!(queue.next(), expected);
    }

    #[test]
    fn shuffle_with_repeat_off_stops_once_every_entry_played() {
        let mut queue = queue(4, 0);
        queue.set_shuffle(true);
        let mut played = HashSet::from([0]);
        for _ in 0..3 {
            let Step::Play(index) = queue.on_end() else {
                panic!("plays")
            };
            assert!(played.insert(index), "no entry plays twice");
        }
        assert_eq!(queue.on_end(), Step::Stop);
    }

    #[test]
    fn appending_during_shuffle_adds_to_the_remaining_pool() {
        let mut queue = queue(2, 0);
        queue.set_shuffle(true);
        queue.append(&[200, 201]);
        assert_eq!(queue.entries().len(), 4);
        let mut played = HashSet::from([0]);
        while let Step::Play(index) = queue.on_end() {
            played.insert(index);
        }
        assert_eq!(played, HashSet::from([0, 1, 2, 3]));
    }

    #[test]
    fn removing_the_playing_entry_starts_the_next_or_stops_at_the_end() {
        let mut queue = queue(3, 1);
        assert_eq!(queue.remove(1), Removed::Current(Step::Play(1)));
        assert_eq!(queue.entries(), [100, 102]);
        assert_eq!(queue.remove(1), Removed::Current(Step::Stop));
        assert_eq!(queue.entries(), [100]);
        assert_eq!(queue.current(), Some(0));
    }

    #[test]
    fn removing_an_entry_before_the_playing_one_keeps_the_song() {
        let mut queue = queue(4, 2);
        assert_eq!(queue.remove(0), Removed::Kept);
        assert_eq!(queue.current(), Some(1));
        assert_eq!(queue.entries()[1], 102);
        assert_eq!(
            queue.remove(2),
            Removed::Kept,
            "an entry after the playing one"
        );
        assert_eq!(queue.current(), Some(1));
        assert_eq!(queue.remove(9), Removed::Nothing);
    }

    #[test]
    fn clear_empties_the_queue() {
        let mut queue = queue(3, 1);
        queue.clear();
        assert_eq!(queue.snapshot(), QueueSnapshot::default());
        assert_eq!(queue.next(), Step::Stop);
    }

    #[test]
    fn append_does_not_change_the_playing_song() {
        let mut queue = queue(2, 1);
        queue.append(&[300]);
        assert_eq!(queue.current(), Some(1));
        assert_eq!(queue.on_end(), Step::Play(2));
    }

    /// Property (P7-AC1): with shuffle and repeat all, the play order splits into cycles that
    /// each play every entry exactly once.
    #[test]
    fn shuffle_plays_every_entry_once_before_any_repeat() {
        for seed in 1..300u64 {
            let len = (seed % 17 + 1) as usize;
            let start = (seed as usize * 7) % len;
            let mut queue = Queue::new(seed);
            queue.replace((0..len as u32).collect(), start);
            queue.set_shuffle(true);
            queue.set_repeat(RepeatMode::All);
            let mut order = vec![start];
            for _ in 0..len * 4 - 1 {
                match queue.on_end() {
                    Step::Play(index) => order.push(index),
                    other => panic!("seed {seed}: {other:?}"),
                }
            }
            for cycle in order.chunks(len) {
                let set: HashSet<usize> = cycle.iter().copied().collect();
                assert_eq!(set.len(), len, "seed {seed}: {order:?}");
            }
        }
    }
}
