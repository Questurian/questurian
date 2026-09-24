import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'dotenv'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FORBIDDEN_IN_PRODUCTION,
  PLACEHOLDER,
  platformProblems,
  redact,
  RUNTIME_KEYS,
  runBootCheck,
} from './boot-env'

/**
 * Launch harness C1. The Railway env template stays true to the code.
 *
 * - Every variable the production boot check reads is documented.
 * - Every variable the server source reads is documented.
 * - The template, with each placeholder filled in, passes the boot check.
 *   That means it is complete enough to boot, not just a list of names.
 * - The provisioning checklist names no variable the template lacks. It
 *   named `COOKIE_DOMAIN` and `REQUIRED_HOSTS`, which the server never
 *   read, until this test.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = resolve(HERE, '../..')
const TEMPLATE_PATH = resolve(SERVER, '../../infra/railway/server.env.template')
const CHECKLIST_PATH = resolve(SERVER, '../../docs/capacity/h01-provisioning-checklist.md')

const templateText = readFileSync(TEMPLATE_PATH, 'utf8')
const templateEnv = parse(templateText)

/** Set (`KEY=`) or documented as optional (`# KEY=`). */
const documented = new Set(
  templateText
    .split('\n')
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key)),
)

/** Synthetic values that satisfy each placeholder. Never real, never sent anywhere. */
function filled(): Record<string, string> {
  const secret = (seed: string) => `${seed}-`.padEnd(64, 'x')
  const synthetic: Record<string, string> = {
    TRUSTED_PROXY: 'cloudflare',
    DATABASE_URI: 'postgres://app:pw@ep-quiet-sky-123456.us-east-2.aws.neon.tech/questura',
    DATABASE_URI_UNPOOLED: 'postgres://app:pw@ep-quiet-sky-123456.us-east-2.aws.neon.tech/questura',
    DATABASE_MAX_CONNECTIONS: '500',
    APP_PROCESS_COUNT: '4',
    REDIS_URL: 'redis://default:pw@redis.railway.internal:6379',
    STRIPE_SECRET_KEY: ['rk', 'live', 'synthetic'.padEnd(24, '0')].join('_'),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ['pk', 'live', 'synthetic'.padEnd(24, '0')].join('_'),
    STRIPE_WEBHOOK_SECRET: ['whsec', 'synthetic'.padEnd(32, '0')].join('_'),
    STRIPE_PRICE_ID_MONTHLY: 'price_synthetic_monthly',
    STRIPE_PRICE_ID_YEARLY: 'price_synthetic_yearly',
    RESEND_API_KEY: 're_synthetic',
    EMAIL_FROM_ADDRESS: 'hello@questurian.com',
    GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
    BUNNY_STORAGE_API_KEY: 'synthetic-bunny-key',
    BUNNY_STORAGE_HOSTNAME: 'questurian-cdn.b-cdn.net',
    BUNNY_STORAGE_ZONE_NAME: 'questura',
  }

  return Object.fromEntries(
    Object.entries(templateEnv).map(([key, value]) => {
      if (!PLACEHOLDER.test(value)) return [key, value]
      return [key, synthetic[key] ?? secret(key)]
    }),
  )
}

/** Env names the server source reads, found by pattern. Blunt, and deliberately so. */
function sourceEnvNames(): Set<string> {
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
    /\benv\??\.([A-Z][A-Z0-9_]{3,})/g,
    /readBoundedInt\(\s*\w+,\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  ]
  const names = new Set<string>()

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (!['migrations', '__fixtures__', '__mocks__', 'node_modules'].includes(entry)) walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\.tsx?$/.test(entry) || entry.includes('.fixture.')) continue
      const source = readFileSync(full, 'utf8')
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) names.add(match[1]!)
      }
    }
  }

  walk(resolve(SERVER, 'src'))
  return names
}

const notApp = (key: string) => RUNTIME_KEYS.has(key) || (FORBIDDEN_IN_PRODUCTION as readonly string[]).includes(key)

describe('the Railway server env template', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('passes the production boot check once its placeholders are filled', async () => {
    const env = filled()
    const { problems } = await runBootCheck(env)

    expect(problems).toEqual([])
    expect(platformProblems(env)).toEqual([])
  })

  it('refuses to boot as committed, placeholders and all', async () => {
    const problems = platformProblems(templateEnv)

    expect(problems.some((problem) => problem.includes('template placeholder'))).toBe(true)
  })

  it('documents every variable the boot check reads', async () => {
    const reads = new Set<string>()
    // An empty environment and the filled template take different branches
    // (cookie hosts, pooler topology), so union both.
    for (const env of [{}, filled()]) {
      vi.resetModules()
      for (const key of (await runBootCheck(env)).keysRead) reads.add(key)
    }

    const undocumented = [...reads].filter((key) => !notApp(key) && !documented.has(key))
    expect(undocumented).toEqual([])
  })

  it('documents every variable the server source reads', () => {
    const undocumented = [...sourceEnvNames()].filter((key) => !notApp(key) && !documented.has(key))

    expect(undocumented).toEqual([])
  })

  it('sets none of the variables that must never reach production', () => {
    for (const key of FORBIDDEN_IN_PRODUCTION) expect(templateEnv[key]).toBeUndefined()
  })

  it('names no server variable in the provisioning checklist that the template lacks', () => {
    const checklist = readFileSync(CHECKLIST_PATH, 'utf8')
    const partB = checklist.slice(checklist.indexOf('## Part B'), checklist.indexOf('## Part C'))
    const named = [...partB.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)].map((match) => match[1]!)

    expect(named.length).toBeGreaterThan(10)
    expect([...new Set(named)].filter((key) => !documented.has(key))).toEqual([])
  })
})

describe('platform checks the boot check cannot make', () => {
  const base = () => filled()

  it.each([
    ['STRIPE_SECRET_KEY', ['sk', 'test', 'x'.repeat(24)].join('_'), 'test-mode'],
    ['STRIPE_SECRET_KEY', ['rk', 'test', 'x'.repeat(24)].join('_'), 'test-mode'],
    ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', ['pk', 'test', 'x'.repeat(24)].join('_'), 'test-mode'],
    ['STRIPE_SECRET_KEY', 'not-a-stripe-key', 'does not look like'],
    ['DATABASE_URI', 'postgres://u:p@localhost:5432/questura', 'loopback'],
    ['DATABASE_URI_UNPOOLED', 'postgres://u:p@127.0.0.1:5433/questura', 'loopback'],
    ['REDIS_URL', 'redis://127.0.0.1:6379', 'loopback'],
    ['REDIS_URL', 'redis://[::1]:6379', 'loopback'],
    ['READINESS_SANDBOX', '1', 'readiness sandbox'],
    ['READINESS_STRIPE_STUB_URL', 'http://127.0.0.1:12111', 'readiness sandbox'],
    ['REFRESH_DISCONNECTED', '1', 'readiness sandbox'],
    ['STRIPE_PRICE_ID', 'price_other', 'both set and differ'],
    ['TRUSTED_PROXY', '<decide>', 'placeholder'],
    ['RESEND_API_KEY', 'sk_live_pasted_into_the_wrong_field', 'does not look like a Resend'],
    ['EMAIL_FROM_ADDRESS', '<e.g. hello@questurian.com>', 'placeholder'],
    ['BUNNY_STORAGE_HOSTNAME', 'storage.bunnycdn.com', 'storage API'],
    ['BUNNY_STORAGE_HOSTNAME', 'ny.storage.bunnycdn.com', 'storage API'],
    ['BUNNY_STORAGE_HOSTNAME', 'https://storage.bunnycdn.com/', 'storage API'],
  ])('refuses %s=%s', (key, value, expected) => {
    expect(platformProblems({ ...base(), [key]: value }).join('\n')).toContain(expected)
  })

  // Plan item 4, "done when": env:check refuses a missing or off-domain sender.
  it.each([
    [{ EMAIL_FROM_ADDRESS: '' }, 'EMAIL_FROM_ADDRESS is not set'],
    [{ EMAIL_FROM_ADDRESS: 'you@gmail.com' }, "not the site's domain"],
    [{ RESEND_API_KEY: '' }, 'RESEND_API_KEY is not set'],
  ])('the boot check refuses %o', async (override, expected) => {
    vi.resetModules()
    const { problems } = await runBootCheck({ ...base(), ...override })

    expect(problems.join('\n')).toContain(expected)
  })

  it('refuses one secret in two roles', () => {
    const env = { ...base(), BETTER_AUTH_SECRET: base().PAYLOAD_SECRET! }

    expect(platformProblems(env).join('\n')).toContain('PAYLOAD_SECRET and BETTER_AUTH_SECRET hold the same value')
  })

  it('accepts STRIPE_PRICE_ID equal to STRIPE_PRICE_ID_MONTHLY', () => {
    const env = { ...base(), STRIPE_PRICE_ID: base().STRIPE_PRICE_ID_MONTHLY! }

    expect(platformProblems(env)).toEqual([])
  })
})

describe('redact', () => {
  it('removes sensitive values wherever they appear', () => {
    const env = { PAYLOAD_SECRET: 'super-secret-value', SITE: 'https://www.questurian.com' }

    expect(redact('got super-secret-value from https://www.questurian.com', env)).toBe(
      'got <PAYLOAD_SECRET> from https://www.questurian.com',
    )
  })

  it('masks credentials in any URL, named or not', () => {
    expect(redact('see postgres://app:hunter2@db.example/x and redis://:pw@r:6379', {})).toBe(
      'see postgres://<credentials>@db.example/x and redis://<credentials>@r:6379',
    )
  })
})
