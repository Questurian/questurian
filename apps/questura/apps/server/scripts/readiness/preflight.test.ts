import { describe, expect, it } from 'vitest'

import { ALLOWED_DATABASES, collectPreflightProblems, type SandboxSettings } from './preflight'
import { buildManifest, sandboxEnv, sandboxSettings } from './sandbox'

function settings(overrides: Partial<SandboxSettings> = {}): SandboxSettings {
  return {
    databaseUri: 'postgres://alan@127.0.0.1:5432/questura_readiness',
    redisUri: 'redis://127.0.0.1:6390',
    redisNamespace: 'readiness:',
    frontendUrl: 'http://127.0.0.1:3100',
    backendUrl: 'http://127.0.0.1:4100',
    env: {},
    ...overrides,
  }
}

describe('readiness preflight', () => {
  it('passes for the default sandbox', () => {
    expect(collectPreflightProblems(settings())).toEqual([])
  })

  // The failure this whole file exists to prevent: the owner's scratch
  // database is at the same host and port as the sandbox, one word apart.
  it('refuses a database that is not on the disposable list', () => {
    const problems = collectPreflightProblems(
      settings({ databaseUri: 'postgres://alan@127.0.0.1:5432/google-login' }),
    )
    expect(problems.join(' ')).toContain('"google-login" is not disposable')
    expect(problems.join(' ')).toContain(ALLOWED_DATABASES[0])
  })

  it('refuses any host that is not loopback', () => {
    const problems = collectPreflightProblems(
      settings({
        databaseUri: 'postgres://user@db.neon.tech:5432/questura_readiness',
        frontendUrl: 'https://www.questurian.com',
      }),
    )
    expect(problems.some((problem) => problem.includes('db.neon.tech'))).toBe(true)
    expect(problems.some((problem) => problem.includes('www.questurian.com'))).toBe(true)
  })

  it('refuses the ports ordinary development is already using', () => {
    const problems = collectPreflightProblems(settings({ frontendUrl: 'http://127.0.0.1:3000' }))
    expect(problems.join(' ')).toContain('port 3000')
  })

  // A test key is refused as firmly as a live one. The plan allows committed
  // fixtures and local stubs for payment behaviour and nothing else, and a
  // test key is exactly how a run starts quietly talking to Stripe.
  it.each([
    ['STRIPE_SECRET_KEY', 'sk_live_51abcdef'],
    ['STRIPE_SECRET_KEY', 'sk_test_51abcdef'],
    ['ANYTHING_AT_ALL', 'rk_live_51abcdef'],
    ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_live_51abcdef'],
  ])('refuses a run carrying %s=%s', (name, value) => {
    const problems = collectPreflightProblems(settings({ env: { [name]: value } }))
    expect(problems.some((problem) => problem.startsWith(name))).toBe(true)
  })

  it('refuses a run that could make a paid image or email call', () => {
    const problems = collectPreflightProblems(settings({ env: { BUNNY_API_KEY: 'x', RESEND_API_KEY: 'y' } }))
    expect(problems.some((problem) => problem.startsWith('BUNNY_API_KEY'))).toBe(true)
    expect(problems.some((problem) => problem.startsWith('RESEND_API_KEY'))).toBe(true)
  })

  it('refuses unnamespaced Redis', () => {
    expect(collectPreflightProblems(settings({ redisNamespace: '' })).join(' ')).toContain('REDIS_NAMESPACE')
  })

  it('reports every problem at once rather than the first', () => {
    const problems = collectPreflightProblems(
      settings({ databaseUri: 'postgres://alan@127.0.0.1:5432/google-login', frontendUrl: 'http://127.0.0.1:3000' }),
    )
    expect(problems.length).toBeGreaterThan(1)
  })
})

describe('sandbox environment', () => {
  it('defaults to the sandbox, not to development', () => {
    const resolved = sandboxSettings({ USER: 'alan' } as NodeJS.ProcessEnv)
    expect(resolved.databaseUri).toContain('/questura_readiness')
    expect(resolved.frontendUrl).toBe('http://127.0.0.1:3100')
    expect(resolved.backendUrl).toBe('http://127.0.0.1:4100')
    expect(collectPreflightProblems(resolved)).toEqual([])
  })

  // Deleted, not blanked: an empty string still passes some `?? ''` reads,
  // while an absent variable makes the feature that needs it refuse.
  it('removes paid-service credentials from a child process rather than blanking them', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_should_never_reach_a_child'
    try {
      const env = sandboxEnv(sandboxSettings({ USER: 'alan' } as NodeJS.ProcessEnv))
      expect('STRIPE_SECRET_KEY' in env).toBe(false)
      expect(env.DATABASE_URI).toContain('questura_readiness')
      expect(env.READINESS_SANDBOX).toBe('1')
    } finally {
      delete process.env.STRIPE_SECRET_KEY
    }
  })
})

describe('sandbox manifest', () => {
  it('records source identity and never copies a credential', () => {
    const manifest = buildManifest(
      settings({ databaseUri: 'postgres://alan:hunter2@127.0.0.1:5432/questura_readiness' }),
      42,
      ['postgres database questura_readiness'],
    )

    expect(manifest.dataset.seed).toBe(42)
    expect(manifest.dataset.database).toBe('questura_readiness')
    expect(manifest.source.sha).toMatch(/^[0-9a-f]{7,40}$|^unknown$/)
    expect(JSON.stringify(manifest)).not.toContain('hunter2')
  })

  it('refuses to describe an environment preflight would not allow', () => {
    expect(() => buildManifest(settings({ databaseUri: 'postgres://alan@127.0.0.1:5432/google-login' }), 1, [])).toThrow(
      /not disposable/,
    )
  })
})
