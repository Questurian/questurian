import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260812_080000_enforce_identity_email_ownership'

function migrationDb() {
  const execute = vi.fn().mockResolvedValue(undefined)
  return {
    db: { execute },
    execute,
    sql: () =>
      execute.mock.calls
        .map(
          ([statement]) =>
            statement.toQuery({
              casing: { getColumnCasing: (column: { name: string }) => column.name },
              escapeName: (name: string) => `"${name}"`,
              escapeParam: (index: number) => `$${index + 1}`,
              escapeString: (value: string) => `'${value.replaceAll("'", "''")}'`,
            }).sql,
        )
        .join('\n'),
  }
}

describe('identity email ownership migration', () => {
  it('registers existing Staff and Visitor emails behind one unique key', async () => {
    const { db, execute, sql } = migrationDb()

    await up({ db } as never)

    expect(execute).toHaveBeenCalled()
    const migration = sql()
    expect(migration).toMatch(/CREATE TABLE[^]*identity_email_owners/i)
    expect(migration).toMatch(/"normalized_email" text PRIMARY KEY/i)
    expect(migration).toMatch(/INSERT INTO "identity_email_owners"[^]*FROM "users"/i)
    expect(migration).toMatch(/INSERT INTO "identity_email_owners"[^]*FROM "visitor_auth_users"/i)
  })

  it('blocks identity writes before taking either backfill snapshot', async () => {
    const { db, sql } = migrationDb()

    await up({ db } as never)

    const migration = sql()
    const lock = migration.indexOf(
      'LOCK TABLE "users", "visitor_auth_users" IN SHARE ROW EXCLUSIVE MODE',
    )
    const staffBackfill = migration.indexOf('FROM "users"')
    const visitorBackfill = migration.indexOf('FROM "visitor_auth_users"')
    const staffTrigger = migration.indexOf('CREATE TRIGGER "users_identity_email_owner"')
    const visitorTrigger = migration.indexOf(
      'CREATE TRIGGER "visitor_auth_users_identity_email_owner"',
    )

    expect(lock).toBeGreaterThanOrEqual(0)
    expect(staffBackfill).toBeGreaterThan(lock)
    expect(visitorBackfill).toBeGreaterThan(staffBackfill)
    expect(staffTrigger).toBeGreaterThan(visitorBackfill)
    expect(visitorTrigger).toBeGreaterThan(staffTrigger)
  })

  it('keeps registry synchronized for both identity tables', async () => {
    const { db, sql } = migrationDb()

    await up({ db } as never)

    expect(sql()).toMatch(/CREATE TRIGGER "users_identity_email_owner"/i)
    expect(sql()).toMatch(/ON "users"/i)
    expect(sql()).toMatch(/CREATE TRIGGER "visitor_auth_users_identity_email_owner"/i)
    expect(sql()).toMatch(/ON "visitor_auth_users"/i)
    expect(sql()).toMatch(/AFTER INSERT OR UPDATE OF "email" OR DELETE/i)
  })

  it('rejects Visitor ownership of the reserved Staff domain', async () => {
    const { db, sql } = migrationDb()

    await up({ db } as never)

    expect(sql()).toMatch(/owner_kind[^]*visitor[^]*normalized_email[^]*@questurian\.com/i)
  })

  it('removes triggers before registry objects on rollback', async () => {
    const { db, sql } = migrationDb()

    await down({ db } as never)

    const rollback = sql()
    const usersTrigger = rollback.indexOf('DROP TRIGGER IF EXISTS "users_identity_email_owner"')
    const visitorsTrigger = rollback.indexOf(
      'DROP TRIGGER IF EXISTS "visitor_auth_users_identity_email_owner"',
    )
    const syncFunction = rollback.indexOf('DROP FUNCTION IF EXISTS "sync_identity_email_owner"')
    const registryTable = rollback.indexOf('DROP TABLE IF EXISTS "identity_email_owners"')

    expect(usersTrigger).toBeGreaterThanOrEqual(0)
    expect(visitorsTrigger).toBeGreaterThan(usersTrigger)
    expect(syncFunction).toBeGreaterThan(visitorsTrigger)
    expect(registryTable).toBeGreaterThan(syncFunction)
  })
})
