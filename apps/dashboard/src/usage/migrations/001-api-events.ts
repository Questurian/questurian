import type { Database } from "bun:sqlite";

/**
 * The one table this app owns.
 *
 * Column names are snake_case while the wire is camelCase -- the mapping lives
 * in `store.ts` and nowhere else. Tokens are flattened into columns rather
 * than kept as JSON so that summing them is a plain SQL aggregate.
 *
 * `cost_usd` is nullable on purpose. Only some providers report a price and
 * this collector never invents one; see docs/adr/0001.
 */
export function createApiEventsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS api_events (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id            TEXT,
      ts                  INTEGER NOT NULL,
      received_at         INTEGER NOT NULL,
      service             TEXT    NOT NULL,
      provider            TEXT    NOT NULL,
      feature             TEXT,
      endpoint            TEXT,
      model               TEXT,
      duration_ms         INTEGER,
      status              TEXT    NOT NULL CHECK (status IN ('ok', 'error')),
      http_status         INTEGER,
      error_kind          TEXT,
      error_message       TEXT,
      input_tokens        INTEGER,
      output_tokens       INTEGER,
      cached_input_tokens INTEGER,
      reasoning_tokens    INTEGER,
      total_tokens        INTEGER,
      cost_usd            REAL,
      cost_basis          TEXT,
      correlation_id      TEXT,
      metadata            TEXT,
      schema_version      INTEGER NOT NULL
    )
  `);

  // Idempotency. A partial index keeps the many rows without an event_id out
  // of it, so an emitter that sends no id pays nothing for this.
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_events_event_id
      ON api_events (event_id) WHERE event_id IS NOT NULL
  `);

  // Every read is time-bounded first, then filtered. The leading column of
  // each index is the filter; ts trails it so the range scan stays covered.
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_events_ts ON api_events (ts)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_events_service_ts ON api_events (service, ts)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_events_provider_ts ON api_events (provider, ts)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_events_status_ts ON api_events (status, ts)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_api_events_correlation ON api_events (correlation_id)`);
}
