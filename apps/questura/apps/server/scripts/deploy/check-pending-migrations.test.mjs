import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assessMigration,
  buildMigrationPlan,
  inspectMigration,
  parseRegisteredMigrationNames,
} from './check-pending-migrations.mjs'

const scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const migrationsRoot = path.resolve(scriptRoot, '../../src/migrations')

test('reads static registered migrations in deployment order', () => {
  const source = `
    export const migrations = [
      { up: first.up, down: first.down, name: 'first' },
      { up: second.up, down: second.down, name: 'second' },
    ]
  `

  assert.deepEqual(parseRegisteredMigrationNames(source), ['first', 'second'])
  assert.throws(
    () => parseRegisteredMigrationNames('export const migrations = [dynamicMigration]'),
    /not a static object/,
  )
})

test('parses every migration registered by the real index', async () => {
  const source = await fs.readFile(path.join(migrationsRoot, 'index.ts'), 'utf8')
  const names = parseRegisteredMigrationNames(source)

  assert.ok(names.length > 0)
  assert.equal(new Set(names).size, names.length)
  await Promise.all(names.map((name) => fs.access(path.join(migrationsRoot, `${name}.ts`))))
})

test('scans only up() and ignores destructive rollback SQL', () => {
  const source = `
    export async function up() { await db.execute(sql.raw('CREATE TABLE example (id int)')) }
    export async function down() { await db.execute(sql.raw('DROP TABLE example')) }
  `

  assert.deepEqual(assessMigration(source, 'example'), [])
})

test('classifies destructive SQL, data rewrites, and auth schema changes', () => {
  const cases = [
    ['DELETE FROM users', 'destructive SQL'],
    ['UPDATE "users" SET "role" = \'admin\';', 'data rewrite'],
    ['WITH ids AS (SELECT id FROM users) UPDATE users SET role = \'admin\';', 'data rewrite'],
    ['DO $$ BEGIN UPDATE users SET role = \'admin\'; END $$;', 'data rewrite'],
    ['ALTER TABLE users ALTER COLUMN email SET NOT NULL', 'column or table rewrite'],
    ['ALTER TYPE status ADD VALUE \'archived\'', 'type rewrite'],
    ['ALTER TABLE visitor_auth_users ADD COLUMN example text', 'visitor auth schema'],
  ]

  for (const [sql, expectedRisk] of cases) {
    const source = `export async function up() { await db.execute(sql.raw(\`${sql}\`)) }
      export async function down() {}`
    assert.ok(assessMigration(source, 'example').includes(expectedRisk), sql)
  }
})

test('fails closed when db.execute SQL cannot be statically inspected', () => {
  const source = `
    export async function up() { const query = makeQuery(); await db.execute(query) }
    export async function down() {}
  `

  assert.deepEqual(inspectMigration(source, 'dynamic'), {
    risks: ['dynamic SQL cannot be inspected', 'dynamic migration logic cannot be inspected'],
    unknownExecutionLines: [2],
    unknownCallLines: [2],
  })
})

test('fails closed on interpolated SQL and helper calls', () => {
  const source = `
    export async function up() {
      await db.execute(sql.raw(\`ALTER TABLE \${table} ADD COLUMN value text\`))
      await migrateRows(db)
    }
    export async function down() {}
  `

  const inspection = inspectMigration(source, 'dynamic')
  assert.ok(inspection.risks.includes('dynamic SQL cannot be inspected'))
  assert.ok(inspection.risks.includes('dynamic migration logic cannot be inspected'))
})

test('allows additive foreign keys with ON DELETE and ON UPDATE clauses', async () => {
  const source = await fs.readFile(
    path.join(migrationsRoot, '20260813_000000_add_service_accounts_preferences_rel.ts'),
    'utf8',
  )

  assert.deepEqual(
    assessMigration(source, '20260813_000000_add_service_accounts_preferences_rel'),
    [],
  )
})

test('plans only unapplied migrations and refuses missing source files', () => {
  const safe = `export async function up() {}
    export async function down() { sql.raw('DROP TABLE old') }`
  const migrationSources = new Map([['second', safe]])

  assert.deepEqual(
    buildMigrationPlan({
      registeredNames: ['first', 'second'],
      appliedNames: ['first'],
      migrationSources,
    }),
    [{ name: 'second', risks: [], unknownExecutionLines: [], unknownCallLines: [] }],
  )

  assert.throws(
    () => buildMigrationPlan({
      registeredNames: ['missing'],
      appliedNames: [],
      migrationSources: new Map(),
    }),
    /Registered migration file is missing/,
  )
})
