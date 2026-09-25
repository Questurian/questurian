import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  evaluatePullRequestMigrations,
  migrationFilesIn,
  parseAcknowledgements,
} from './check-pr-migrations.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-pr-migrations.mjs')

const drop = (table) => `import { sql } from '@payloadcms/db-postgres'
export async function up({ db }) { await db.execute(sql\`DROP TABLE "${table}";\`) }
export async function down({ db }) {}
`
const additive = `import { sql } from '@payloadcms/db-postgres'
export async function up({ db }) { await db.execute(sql\`ALTER TABLE "articles" ADD COLUMN "probe" varchar;\`) }
export async function down({ db }) { await db.execute(sql\`ALTER TABLE "articles" DROP COLUMN "probe";\`) }
`

test('reads one acknowledgement per line, by exact migration name', () => {
  const body = [
    'Removes the old table.',
    '',
    'Acknowledge-risky-migration: 20260924_000000_drop_old',
    '- acknowledge-risky-migration:   20260924_000001_drop_other  ',
    'Acknowledge-risky-migration: 20260924_000002_x and also something else',
    'Mentioning Acknowledge-risky-migration: 20260924_000003_inline mid-sentence does not count',
  ].join('\n')

  assert.deepEqual(
    [...parseAcknowledgements(body)],
    ['20260924_000000_drop_old', '20260924_000001_drop_other'],
  )
  assert.equal(parseAcknowledgements(undefined).size, 0)
})

test('only top-level migration files count, not the registry or other paths', () => {
  assert.deepEqual(
    migrationFilesIn([
      'apps/questura/apps/server/src/migrations/20260924_000000_a.ts',
      'apps/questura/apps/server/src/migrations/20260924_000000_a.json',
      'apps/questura/apps/server/src/migrations/index.ts',
      'apps/questura/apps/server/src/migrations/nested/b.ts',
      'apps/questura/apps/server/src/collections/Articles.ts',
    ]),
    ['apps/questura/apps/server/src/migrations/20260924_000000_a.ts'],
  )
})

test('a DROP in up() is blocked unless that migration is acknowledged', () => {
  const migrations = [
    { name: '20260924_000000_drop_old', source: drop('old') },
    { name: '20260924_000001_drop_other', source: drop('other') },
    { name: '20260924_000002_add_probe', source: additive },
  ]

  const unacknowledged = evaluatePullRequestMigrations({ migrations, body: '' })
  assert.deepEqual(unacknowledged.blocked.map(({ name }) => name), ['20260924_000000_drop_old', '20260924_000001_drop_other'])
  assert.ok(unacknowledged.blocked[0].risks.includes('destructive SQL'))

  // Acknowledging one does not wave the other through.
  const one = evaluatePullRequestMigrations({ migrations, body: 'Acknowledge-risky-migration: 20260924_000000_drop_old' })
  assert.deepEqual(one.acknowledged.map(({ name }) => name), ['20260924_000000_drop_old'])
  assert.deepEqual(one.blocked.map(({ name }) => name), ['20260924_000001_drop_other'])
  assert.equal(one.results[2].status, 'safe', 'a DROP in down() is the rollback, not a risk')
})

test('a migration that cannot be parsed is blocked, not skipped', () => {
  const { blocked } = evaluatePullRequestMigrations({
    migrations: [{ name: 'broken', source: 'export async function up( {' }],
    body: '',
  })
  assert.equal(blocked.length, 1)
  assert.match(blocked[0].risks[0], /cannot be inspected/)
})

test('the CLI fails a branch that adds a DROP and passes once it is acknowledged', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'questura-pr-migrations-'))
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
  const run = (env) => {
    try {
      const stdout = execFileSync(process.execPath, [script], {
        cwd: repo,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, ...env },
      })
      return { status: 0, output: stdout }
    } catch (error) {
      return { status: error.status, output: `${error.stdout}${error.stderr}` }
    }
  }

  try {
    const dir = path.join(repo, 'apps/questura/apps/server/src/migrations')
    fs.mkdirSync(dir, { recursive: true })
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.writeFileSync(path.join(dir, 'index.ts'), 'export const migrations = []\n')
    git('add', '.')
    git('commit', '-qm', 'base')

    fs.writeFileSync(path.join(dir, '20260923_000000_add_probe.ts'), additive)
    git('add', '.')
    git('commit', '-qm', 'additive')
    const additiveRun = run({ PR_BODY: '' })
    assert.equal(additiveRun.status, 0, additiveRun.output)
    assert.match(additiveRun.output, /20260923_000000_add_probe: safe/)

    fs.writeFileSync(path.join(dir, '20260924_000000_drop_old.ts'), drop('old'))
    git('add', '.')
    git('commit', '-qm', 'drop')

    const red = run({ PR_BODY: 'Tidy up.' })
    assert.equal(red.status, 1)
    assert.match(red.output, /20260924_000000_drop_old: blocked \(destructive SQL\)/)
    assert.match(red.output, /Acknowledge-risky-migration: 20260924_000000_drop_old/)

    const green = run({ PR_BODY: 'Acknowledge-risky-migration: 20260924_000000_drop_old' })
    assert.equal(green.status, 0, green.output)
    assert.match(green.output, /20260924_000000_drop_old: acknowledged/)
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
})
