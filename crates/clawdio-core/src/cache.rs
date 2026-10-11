//! `library.sqlite`, the rebuildable library cache (R19, D14). P4 writes the scanned rows;
//! P5 adds incremental sync, the schema version rebuild and the D44 flags.

use std::path::Path;

use rusqlite::{params, Connection};

use crate::library::NewTrack;

pub const CACHE_FILE: &str = "library.sqlite";
pub const SCHEMA_VERSION: i32 = 1;

pub struct Cache {
    connection: Connection,
}

impl Cache {
    /// Opens or creates the cache in `cache_dir`.
    pub fn open(cache_dir: &Path) -> rusqlite::Result<Self> {
        std::fs::create_dir_all(cache_dir)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        Self::with_connection(Connection::open(cache_dir.join(CACHE_FILE))?)
    }

    /// An in-memory cache, for tests.
    pub fn in_memory() -> rusqlite::Result<Self> {
        Self::with_connection(Connection::open_in_memory()?)
    }

    fn with_connection(connection: Connection) -> rusqlite::Result<Self> {
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS tracks (
                rel_path TEXT PRIMARY KEY,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                title TEXT NOT NULL,
                tag_artist TEXT,
                track_no INTEGER,
                disc INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL
            );",
        )?;
        connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        Ok(Cache { connection })
    }

    /// Writes a batch of tracks in one transaction.
    pub fn put_batch(&mut self, tracks: &[NewTrack]) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;
        {
            let mut statement = transaction.prepare_cached(
                "INSERT OR REPLACE INTO tracks
                 (rel_path, artist, album, title, tag_artist, track_no, disc, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for track in tracks {
                statement.execute(params![
                    track.rel_path,
                    track.artist,
                    track.album,
                    track.title,
                    track.tag_artist,
                    track.track_no,
                    track.disc,
                    track.duration_ms
                ])?;
            }
        }
        transaction.commit()
    }

    /// Removes every row, for a new music folder.
    pub fn clear(&mut self) -> rusqlite::Result<()> {
        self.connection
            .execute("DELETE FROM tracks", [])
            .map(|_| ())
    }

    pub fn count(&self) -> rusqlite::Result<i64> {
        self.connection
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str) -> NewTrack {
        NewTrack {
            rel_path: path.into(),
            artist: "A".into(),
            album: "B".into(),
            title: "T".into(),
            tag_artist: None,
            track_no: Some(1),
            disc: 0,
            duration_ms: 1000,
        }
    }

    #[test]
    fn writes_batches_and_clears() {
        let mut cache = Cache::in_memory().unwrap();
        cache
            .put_batch(&[track("A/B/1.mp3"), track("A/B/2.mp3")])
            .unwrap();
        cache.put_batch(&[track("A/B/2.mp3")]).unwrap();
        assert_eq!(cache.count().unwrap(), 2);
        cache.clear().unwrap();
        assert_eq!(cache.count().unwrap(), 0);
    }

    #[test]
    fn stores_the_schema_version() {
        let dir = tempfile::tempdir().unwrap();
        let cache = Cache::open(dir.path()).unwrap();
        let version: i32 = cache
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }
}
