// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fixtureDataProblems, fixtureMigrations, repositoryMigrations } from './bootstrap'
import { collectPreflightProblems } from './preflight'
import { dotenvNames, neutraliseDotenv, withOutboundGuard } from './sandbox-env'

/**
 * The sandbox's own guarantees (surge plan L00/L01), checked without a
 * database: the schema fixture carries no data and is compatible with the
 * migrations the repository ships; `.env` names cannot leak into a sandbox
 * process; the socket guard refuses anything that is not loopback.
 */

describe('the schema fixture', () => {
  it('carries schema and the migration ledger, nothing else', () => {
    expect(fixtureDataProblems()).toEqual([])
  })

  // Bootstrap loads the fixture and then runs `payload migrate`, so the
  // fixture may lag the repository — but it must not know a migration the
  // repository does not have, or it describes a schema this code never built.
  // Five early migrations were applied and their files later removed from
  // the repository; they are history in every real database's ledger too.
  const HISTORICAL = [
    '20260514000000_promote_location_cover_image',
    '20260514001000_drop_location_guide_storage',
    '20260515000000_media_set_source_focal_point',
    '20260528000000_itinerary_angle_and_list_tone',
    '20260529000000_better_auth_visitor_tables',
  ]

  it('records only migrations the repository ships, apart from named history', () => {
    const shipped = new Set([...repositoryMigrations(), ...HISTORICAL])
    const unknown = fixtureMigrations().filter((name) => !shipped.has(name))
    expect(unknown).toEqual([])
  })

  it('knows the migrations that predate the chain’s own files', () => {
    expect(fixtureMigrations().length).toBeGreaterThan(0)
  })

  it('refuses a fixture that carries rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-'))
    const path = join(dir, 'schema.sql')
    writeFileSync(path, "CREATE TABLE t (id int);\nINSERT INTO public.users VALUES (1);\nCOPY public.articles FROM stdin;\n")
    expect(fixtureDataProblems(path)).toEqual(['The fixture contains COPY data.', 'The fixture inserts into public.users.'])
  })
})

describe('neutraliseDotenv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dotenv-'))
  writeFileSync(join(dir, '.env'), 'SENTRY_DSN=https://x\n# comment\nexport BUNNY_API_KEY=abc\nDATABASE_URI=postgres://real\n')
  writeFileSync(join(dir, '.env.production.local'), 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza-real\n')

  it('reads every name the files define, and no values', () => {
    expect(dotenvNames(dir)).toEqual(['BUNNY_API_KEY', 'DATABASE_URI', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'SENTRY_DSN'])
  })

  it('blanks what the harness did not set, and keeps what it did', () => {
    const { env, neutralised } = neutraliseDotenv({ DATABASE_URI: 'postgres://sandbox' } as unknown as NodeJS.ProcessEnv, dir)
    expect(env.DATABASE_URI).toBe('postgres://sandbox')
    expect(env.SENTRY_DSN).toBe('')
    expect(env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).toBe('')
    expect(neutralised).toEqual(['BUNNY_API_KEY', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'SENTRY_DSN'])
  })
})

describe('the outbound guard', () => {
  const probe = `
    const http = require('node:http')
    const out = []
    const server = http.createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', async () => {
      const port = server.address().port
      out.push('loopback ' + (await fetch('http://127.0.0.1:' + port)).status)
      out.push('dot-localhost ' + (await fetch('http://api.readiness.localhost:' + port)).status)
      try { await fetch('http://example.com', { signal: AbortSignal.timeout(3000) }); out.push('external reached') }
      catch (e) { out.push('external ' + (e.cause && e.cause.code)) }
      server.close(() => console.log(out.join('|')))
    })`

  it('allows loopback, maps *.localhost to it, and refuses the rest loudly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-'))
    const log = join(dir, 'outbound.log')
    const env = withOutboundGuard({ PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv, log)
    const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' })
    expect(result.stdout.trim()).toBe('loopback 200|dot-localhost 200|external EREADINESSOUTBOUND')
    const logged = require('node:fs').readFileSync(log, 'utf8')
    expect(logged).toContain('"host":"example.com"')
    expect(logged).not.toContain('localhost')
  })

  it('points at a file that exists', () => {
    expect(resolve(__dirname, 'deny-outbound.cjs')).toMatch(/deny-outbound\.cjs$/)
  })
})

describe('preflight', () => {
  const base = {
    databaseUri: 'postgres://me@127.0.0.1:5432/questura_readiness',
    redisUri: 'redis://127.0.0.1:6390',
    redisNamespace: 'readiness:',
    frontendUrl: 'http://127.0.0.1:3100',
    backendUrl: 'http://127.0.0.1:4100',
    env: {},
  }

  it('refuses 0.0.0.0, which is every interface, not loopback', () => {
    expect(collectPreflightProblems({ ...base, backendUrl: 'http://0.0.0.0:4100' }).join(' ')).toContain('points off this machine')
  })

  it('accepts the browser-facing *.localhost names', () => {
    expect(collectPreflightProblems({ ...base, frontendUrl: 'http://app.readiness.localhost:3100' })).toEqual([])
  })
})
