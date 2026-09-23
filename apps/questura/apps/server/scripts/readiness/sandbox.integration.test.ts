// @vitest-environment node
//
// Real connections, real timers, real `fetch`. The default jsdom environment
// replaces enough of the platform that `AbortSignal.timeout()` is not the
// AbortSignal its `fetch` accepts — which fails the delivery under test for a
// reason that has nothing to do with the code.
import type { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createSandboxSchema,
  REFRESH_JOBS_DDL,
  sandboxReadyOrSkip,
  sandboxClient,
  sandboxPool,
} from './database'

/**
 * L00's acceptance: the harness can show commit visibility with two real
 * connections.
 *
 * This is the test the existing `verify-refresh-outbox.ts` cannot be. That
 * script does its work inside one transaction on one connection and rolls
 * back at the end, which proves the SQL parses and merges correctly and
 * proves nothing at all about what another process can see. Everything the
 * publishing tasks claim — that an obligation exists exactly when the content
 * does, that a second worker cannot see uncommitted work — is a statement
 * about two connections.
 *
 * Skips when no disposable Postgres is reachable. A green CI run therefore
 * does not mean this passed; the recorded run under `docs/capacity/runs/`
 * does.
 */

/** This file's private schema, so a parallel test file cannot truncate under it. */
const SCHEMA = 'readiness_sandbox'

const available = await sandboxReadyOrSkip()


describe.skipIf(!available)('readiness sandbox: two real connections', () => {
  let pool: Pool
  let observer: Client

  beforeAll(async () => {
    await createSandboxSchema(SCHEMA)
    pool = sandboxPool(4, SCHEMA)
    await pool.query(REFRESH_JOBS_DDL)
    await pool.query('TRUNCATE refresh_jobs RESTART IDENTITY')
    observer = await sandboxClient(SCHEMA)
  })

  afterAll(async () => {
    await observer?.end()
    await pool?.end()
  })

  it('hides an uncommitted obligation from another connection, and shows it after commit', async () => {
    const writer = await sandboxClient(SCHEMA)
    try {
      await writer.query('BEGIN')
      await writer.query(
        `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, next_attempt_at)
         VALUES ('revalidate', 'visibility-probe', '{"tags":["t"],"paths":[]}'::jsonb, 'probe', 'pending', now())`,
      )

      const duringTransaction = await observer.query(
        `SELECT count(*)::int AS n FROM refresh_jobs WHERE dedupe_key = 'visibility-probe'`,
      )
      expect(duringTransaction.rows[0].n).toBe(0)

      await writer.query('COMMIT')

      const afterCommit = await observer.query(
        `SELECT count(*)::int AS n FROM refresh_jobs WHERE dedupe_key = 'visibility-probe'`,
      )
      expect(afterCommit.rows[0].n).toBe(1)
    } finally {
      await writer.end()
    }
  })

  it('loses the obligation when the writing transaction rolls back', async () => {
    const writer = await sandboxClient(SCHEMA)
    try {
      await writer.query('BEGIN')
      await writer.query(
        `INSERT INTO refresh_jobs (kind, dedupe_key, target, reason, status, next_attempt_at)
         VALUES ('revalidate', 'rollback-probe', '{"tags":["t"],"paths":[]}'::jsonb, 'probe', 'pending', now())`,
      )
      await writer.query('ROLLBACK')
    } finally {
      await writer.end()
    }

    const after = await observer.query(
      `SELECT count(*)::int AS n FROM refresh_jobs WHERE dedupe_key = 'rollback-probe'`,
    )
    expect(after.rows[0].n).toBe(0)
  })

  it('starts a second run from the same state', async () => {
    await pool.query('TRUNCATE refresh_jobs RESTART IDENTITY')
    const count = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs`)
    expect(count.rows[0].n).toBe(0)
  })
})
