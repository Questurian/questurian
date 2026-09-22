import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RefreshJobs } from '@/features/refresh-outbox/collection'

import { REFRESH_JOBS_DDL } from './database'

/**
 * The sandbox builds `refresh_jobs` directly rather than running Payload's
 * whole migration chain, which keeps setup under a second and keeps these
 * tests independent of schema churn elsewhere. The cost of that shortcut is
 * drift: a column added to the collection and migrated in production, absent
 * from the sandbox, makes every readiness test pass against a table that no
 * longer exists anywhere real.
 *
 * So the shortcut is checked. Every field on the collection must appear as a
 * column in the sandbox DDL, and every column the worker's SQL depends on
 * must appear in a committed migration.
 */

const MIGRATIONS = resolve(__dirname, '../../src/migrations')

function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function migrationSql(): string {
  const files = ['20260921_214514_refresh_jobs_outbox.ts', '20260922_063804_refresh_jobs_fencing.ts']
  return files.map((file) => readFileSync(resolve(MIGRATIONS, file), 'utf8')).join('\n')
}

describe('refresh_jobs schema', () => {
  it('gives the sandbox every column the collection declares', () => {
    const missing = RefreshJobs.fields
      .map((field) => snakeCase((field as { name: string }).name))
      .filter((column) => !new RegExp(`\\b${column}\\b`).test(REFRESH_JOBS_DDL))

    expect(missing, 'columns on the collection that the sandbox table does not have').toEqual([])
  })

  // The fence is only a fence if it exists in the deployed schema.
  it.each(['generation', 'claim_token', 'claimed_generation'])(
    'has a committed migration adding %s',
    (column) => {
      expect(migrationSql()).toContain(`ADD COLUMN "${column}"`)
    },
  )

  it('keeps the fencing migration additive', () => {
    const fencing = readFileSync(resolve(MIGRATIONS, '20260922_063804_refresh_jobs_fencing.ts'), 'utf8')
    const up = fencing.slice(fencing.indexOf('export async function up'), fencing.indexOf('export async function down'))

    expect(up).not.toMatch(/DROP|DELETE|TRUNCATE/i)
    // An old process must keep working against the new schema during a
    // rolling deploy, so the new columns have to have defaults or be nullable.
    expect(up).toContain('"generation" numeric DEFAULT 1 NOT NULL')
    expect(up).toContain('"claim_token" varchar')
  })

  it('is registered in the migration index', () => {
    const index = readFileSync(resolve(MIGRATIONS, 'index.ts'), 'utf8')
    expect(index).toContain('20260922_063804_refresh_jobs_fencing')
  })
})
