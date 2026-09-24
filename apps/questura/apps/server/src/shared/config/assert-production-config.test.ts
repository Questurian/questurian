import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }
  return import('./assert-production-config')
}

const VALID_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://questurian.com',
  BACKEND_URL_LOCAL: 'https://api.questurian.com',
  CORS_ALLOWED_ORIGINS: 'https://questurian.com',
  REDIS_URL: 'redis://cache.internal:6379',
  PAYLOAD_COOKIE_DOMAIN: 'questurian.com',
  PAYLOAD_COOKIE_REQUIRED_HOSTS: 'api.questurian.com,questurian.com',
  PAYLOAD_SECRET: 'p'.repeat(32),
  BETTER_AUTH_SECRET: 'b'.repeat(48),
  STRIPE_SECRET_KEY: 'sk_test_placeholder_not_a_real_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_placeholder_not_a_real_secret',
  STRIPE_PRICE_ID: 'price_monthly_placeholder',
  TRUSTED_PROXY: 'cloudflare',
  DATABASE_MAX_CONNECTIONS: '100',
  APP_PROCESS_COUNT: '1',
  APP_ROLLOUT_SURGE: '0',
  // Publishing is only durable if the frontend it publishes to is named.
  QUESTURA_CLIENT_URL: 'https://questurian.com',
  QUESTURA_REVALIDATION_SECRET: 'r'.repeat(32),
  // Mail that arrives: a key, and a sender on the site's own domain.
  RESEND_API_KEY: 're_placeholder_not_a_real_key',
  EMAIL_FROM_ADDRESS: 'hello@questurian.com',
  BUNNY_STORAGE_HOSTNAME: 'questurian-cdn.b-cdn.net',
}

describe('production config assertion', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    vi.stubEnv('BACKEND_URL_LOCAL', '')
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '')
    vi.stubEnv('REDIS_URL', '')
    vi.stubEnv('PAYLOAD_COOKIE_DOMAIN', '')
    vi.stubEnv('PAYLOAD_COOKIE_REQUIRED_HOSTS', '')
    vi.stubEnv('PAYLOAD_SECRET', '')
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.stubEnv('BUNNY_STORAGE_HOSTNAME', '')
    vi.stubEnv('STRIPE_PRICE_ID', '')
    vi.stubEnv('STRIPE_PRICE_ID_MONTHLY', '')
    vi.stubEnv('TRUSTED_PROXY', '')
    vi.stubEnv('DATABASE_URI', 'postgres://u:p@db.internal:5432/questura')
    vi.stubEnv('DATABASE_URI_UNPOOLED', '')
    vi.stubEnv('DATABASE_URL_UNPOOLED', '')
    vi.stubEnv('DATABASE_MAX_CONNECTIONS', '')
    vi.stubEnv('APP_PROCESS_COUNT', '')
    vi.stubEnv('APP_ROLLOUT_SURGE', '')
    vi.stubEnv('APP_JOB_PROCESS_COUNT', '')
    vi.stubEnv('DATABASE_RESERVED_CONNECTIONS', '')
    vi.stubEnv('DATABASE_POOLER_MAX_CLIENTS', '')
    vi.stubEnv('DATABASE_POOLER_POOL_SIZE', '')
    vi.stubEnv('DATABASE_POOL_PAYLOAD_MAX', '')
    vi.stubEnv('DATABASE_POOL_VISITOR_AUTH_MAX', '')
    vi.stubEnv('DATABASE_POOL_ADVISORY_LOCK_MAX', '')
    vi.stubEnv('QUESTURA_CLIENT_URL', '')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    vi.stubEnv('FRONTEND_URL', '')
    vi.stubEnv('QUESTURA_REVALIDATION_SECRET', '')
    vi.stubEnv('REVALIDATION_SECRET', '')
    vi.stubEnv('REFRESH_DISCONNECTED', '')
    vi.stubEnv('REFRESH_OUTBOX', '')
    vi.stubEnv('REFRESH_OUTBOX_DEGRADED_ACK', '')
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM_ADDRESS', '')
    vi.stubEnv('EMAIL_FROM_NAME', '')
    vi.stubEnv('EMAIL_REPLY_TO', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is a no-op outside production, even with nothing configured', async () => {
    const { assertProductionConfig, collectProductionConfigProblems } = await load({
      NODE_ENV: 'development',
    })

    expect(collectProductionConfigProblems()).toEqual([])
    expect(() => assertProductionConfig()).not.toThrow()
  })

  it('passes on a correctly configured production environment', async () => {
    const { assertProductionConfig, collectProductionConfigProblems } =
      await load(VALID_PRODUCTION_ENV)

    expect(collectProductionConfigProblems()).toEqual([])
    expect(() => assertProductionConfig()).not.toThrow()
  })

  it('rejects a production boot with no app url', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('NEXT_PUBLIC_APP_URL is not set')
  })

  // The visitor session cookie is SameSite=Lax: a site and API on different
  // registrable domains boot fine and sign every reader out on every page.
  it.each([
    ['https://questura-api.vercel.app'],
    ['https://api.questurian.net'],
  ])('refuses an API on another site (%s)', async (backend) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: backend,
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('are not the same site')
  })

  // Both on Railway's generated hosts: they share `railway.app`, but
  // `up.railway.app` is a public suffix, so a browser treats them as two sites.
  it('refuses a site and API on two Railway-generated hosts', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: 'https://questura-web.up.railway.app',
      BACKEND_URL_LOCAL: 'https://questura-api.up.railway.app',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('are not the same site')
  })

  it('accepts sibling hosts of one site, as soft-prod runs them', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      PAYLOAD_COOKIE_REQUIRED_HOSTS: 'cms.questurian.com,www.questurian.com',
    })

    expect(collectProductionConfigProblems().join('\n')).not.toContain('are not the same site')
  })

  it('rejects a production boot with no backend url', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('BACKEND_URL_LOCAL is not set')
  })

  it.each(['not-a-url', 'ftp://cms.questurian.com'])(
    'rejects malformed or unsupported production URL %s',
    async (url) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        BACKEND_URL_LOCAL: url,
      })

      expect(collectProductionConfigProblems().join('\n')).toMatch(/not a valid URL|must use http/)
    }
  )

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
  ])('rejects %s as a production app url', async (url) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      NEXT_PUBLIC_APP_URL: url,
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('points at localhost')
  })

  it('rejects an empty CORS origin list in production', async () => {
    const { collectProductionConfigProblems } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: 'https://api.questurian.com',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('No CORS origins configured')
  })

  it('rejects a production boot with no shared rate-limit backend', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      REDIS_URL: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('REDIS_URL is not set')
  })

  it.each(['PAYLOAD_SECRET', 'BETTER_AUTH_SECRET'])(
    'rejects a production boot with no %s',
    async (name) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        [name]: '',
      })

      expect(collectProductionConfigProblems().join('\n')).toContain(`${name} is not set`)
    }
  )

  it.each(['PAYLOAD_SECRET', 'BETTER_AUTH_SECRET'])(
    'rejects a 31-character %s',
    async (name) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        [name]: 's'.repeat(31),
      })

      expect(collectProductionConfigProblems().join('\n')).toContain(
        `${name} is shorter than the 32-character minimum`
      )
    }
  )

  it.each(['PAYLOAD_SECRET', 'BETTER_AUTH_SECRET'])('accepts a 32-character %s', async (name) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      [name]: 's'.repeat(32),
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  // Whitespace is not entropy — a padded short secret must not pass the floor.
  it('rejects a whitespace-padded short secret', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_SECRET: `  ${'s'.repeat(24)}          `,
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('PAYLOAD_SECRET is shorter')
  })

  // Better Auth falls back to PAYLOAD_SECRET when BETTER_AUTH_SECRET is unset.
  // A long PAYLOAD_SECRET must not satisfy the check for the missing one.
  it('does not let PAYLOAD_SECRET stand in for BETTER_AUTH_SECRET', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_SECRET: 'p'.repeat(64),
      BETTER_AUTH_SECRET: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('BETTER_AUTH_SECRET is not set')
  })

  it.each(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'])(
    'rejects a production boot with no %s',
    async (name) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        [name]: '',
      })

      expect(collectProductionConfigProblems().join('\n')).toContain(`${name} is not set`)
    }
  )

  it('rejects a production boot with no image host', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BUNNY_STORAGE_HOSTNAME: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('BUNNY_STORAGE_HOSTNAME is not set')
  })

  it('rejects a production boot with no monthly Stripe price id', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      STRIPE_PRICE_ID: '',
      STRIPE_PRICE_ID_MONTHLY: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('STRIPE_PRICE_ID')
  })

  it('accepts STRIPE_PRICE_ID_MONTHLY when STRIPE_PRICE_ID is unset', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      STRIPE_PRICE_ID: '',
      STRIPE_PRICE_ID_MONTHLY: 'price_monthly_from_new_var',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  // Boot errors reach logs and process supervisors, so a rejection must never
  // carry the secret itself — nor a length or prefix that narrows a guess.
  it('never puts a secret value in the thrown message', async () => {
    const shortSecret = 'correct-horse-battery-x'
    const stripeSecret = 'sk_live_this-must-not-appear-in-logs'
    const webhookSecret = 'whsec_this-must-not-appear-either'
    const { assertProductionConfig } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_SECRET: shortSecret,
      BETTER_AUTH_SECRET: 'staple-tribune-nonsense-value',
      STRIPE_SECRET_KEY: stripeSecret,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
    })

    let message = ''
    try {
      assertProductionConfig()
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('PAYLOAD_SECRET')
    expect(message).toContain('BETTER_AUTH_SECRET')
    expect(message).not.toContain(shortSecret)
    expect(message).not.toContain('correct-horse')
    expect(message).not.toContain('staple-tribune')
    expect(message).not.toContain(String(shortSecret.length))
    expect(message).not.toContain(stripeSecret)
    expect(message).not.toContain(webhookSecret)
    expect(message).not.toContain('sk_live_')
    expect(message).not.toContain('whsec_this')
  })

  it('rejects a production boot with no session cookie domain decision', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain(
      'PAYLOAD_COOKIE_DOMAIN is not set'
    )
  })

  it('accepts a deliberate host-only deployment', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: 'host-only',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  it.each([
    ['https://questurian.com', 'not a URL'],
    ['questurian.com:4000', 'port'],
    ['localhost', 'single-label'],
  ])('rejects %s as a session cookie domain', async (domain, expected) => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_DOMAIN: domain,
    })

    const problems = collectProductionConfigProblems().join('\n')
    expect(problems).toContain('PAYLOAD_COOKIE_DOMAIN')
    expect(problems).toContain(expected)
  })

  it('rejects a cookie domain that the Payload host cannot set', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      PAYLOAD_COOKIE_REQUIRED_HOSTS: 'cms.questurian.com',
      PAYLOAD_COOKIE_DOMAIN: 'staging.questurian.com',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain('cms.questurian.com')
  })

  // The real deployment: Payload on cms, staff UI on www, the AI Blog Writer
  // on abw/abw-api. Scoping the cookie to Payload's own host boots cleanly and
  // leaves every sibling with no cookie at all.
  it('rejects scoping the cookie to the Payload host while siblings need it', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
      PAYLOAD_COOKIE_REQUIRED_HOSTS:
        'www.questurian.com,abw.questurian.com,abw-api.questurian.com',
      PAYLOAD_COOKIE_DOMAIN: 'cms.questurian.com',
    })

    const problems = collectProductionConfigProblems().join('\n')
    expect(problems).toContain('PAYLOAD_COOKIE_DOMAIN')
    expect(problems).toContain('www.questurian.com')
    expect(problems).toContain('abw.questurian.com')
  })

  it('accepts the registrable domain that reaches every required host', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
      PAYLOAD_COOKIE_REQUIRED_HOSTS:
        'www.questurian.com,abw.questurian.com,abw-api.questurian.com',
      PAYLOAD_COOKIE_DOMAIN: 'questurian.com',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  it('rejects a widened cookie with no stated list of hosts that need it', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      PAYLOAD_COOKIE_REQUIRED_HOSTS: '',
    })

    expect(collectProductionConfigProblems().join('\n')).toContain(
      'PAYLOAD_COOKIE_REQUIRED_HOSTS is not set'
    )
  })

  // A browser origin is not automatically a host that should hold a staff
  // session, and no Domain can span two registrable domains — deriving the
  // required hosts from CORS would make a legitimate origin unbootable.
  it('accepts a CORS origin on another registrable domain', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      BACKEND_URL_LOCAL: 'https://cms.questurian.com',
      CORS_ALLOWED_ORIGINS: 'https://www.questurian.com,https://questura-preview.vercel.app',
      PAYLOAD_COOKIE_REQUIRED_HOSTS: 'www.questurian.com,abw.questurian.com',
      PAYLOAD_COOKIE_DOMAIN: 'questurian.com',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  // Unset, `getClientIp` reads the first x-forwarded-for entry, which the
  // caller writes — so every rate limit becomes bypassable by rotating one
  // header. Refusing the boot is the point: a platform move must restate this.
  it('refuses a production boot that has not said which proxy fronts it', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      TRUSTED_PROXY: '',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('TRUSTED_PROXY is not set'),
    ])
  })

  it('refuses a misspelled proxy rather than falling back', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      TRUSTED_PROXY: 'cloudfare',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('TRUSTED_PROXY is set to an unknown value'),
    ])
  })

  it('reports every problem at once rather than one per boot', async () => {
    const { collectProductionConfigProblems } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: '',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(collectProductionConfigProblems().length).toBeGreaterThanOrEqual(3)
  })

  it('throws a message naming each problem', async () => {
    const { assertProductionConfig } = await load({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: '',
      BACKEND_URL_LOCAL: '',
      CORS_ALLOWED_ORIGINS: '',
    })

    expect(() => assertProductionConfig()).toThrow(/Refusing to boot/)
    expect(() => assertProductionConfig()).toThrow(/NEXT_PUBLIC_APP_URL/)
    expect(() => assertProductionConfig()).toThrow(/BACKEND_URL_LOCAL/)
  })

  // Session-level advisory locks do not survive transaction pooling, and the
  // failure is silent: the lock that stops two concurrent Stripe webhooks for
  // one customer from both sending the same email simply stops working. The
  // change that breaks it is one environment variable.
  it('refuses a pooled DATABASE_URI with no direct endpoint for the locks', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_URI: 'postgres://u:p@ep-x-123-pooler.us-east-2.aws.neon.tech/db',
      DATABASE_POOLER_MAX_CLIENTS: '1000',
      DATABASE_POOLER_POOL_SIZE: '20',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('DATABASE_URI_UNPOOLED is not set'),
    ])
  })

  it('accepts a pooled DATABASE_URI once the direct endpoint is named', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_URI: 'postgres://u:p@ep-x-123-pooler.us-east-2.aws.neon.tech/db',
      DATABASE_POOLER_MAX_CLIENTS: '1000',
      DATABASE_POOLER_POOL_SIZE: '20',
      DATABASE_URI_UNPOOLED: 'postgres://u:p@ep-x-123.us-east-2.aws.neon.tech/db',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })

  it('refuses a direct endpoint that is itself pooled', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_URI: 'postgres://u:p@ep-x-123-pooler.us-east-2.aws.neon.tech/db',
      DATABASE_POOLER_MAX_CLIENTS: '1000',
      DATABASE_POOLER_POOL_SIZE: '20',
      DATABASE_URI_UNPOOLED: 'postgres://u:p@other-pooler.us-east-2.aws.neon.tech/db',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('DATABASE_URI_UNPOOLED also looks transaction-pooled'),
    ])
  })

  // Pool maxima are per process and live in three files. The first symptom of
  // getting this wrong is `FATAL: sorry, too many clients already`.
  it('refuses a pool budget that cannot fit the declared allowance', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_MAX_CONNECTIONS: '100',
      APP_PROCESS_COUNT: '3',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('exceed the database allowance'),
    ])
  })

  it('refuses a production boot that has not stated its connection budget', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_MAX_CONNECTIONS: '',
      APP_PROCESS_COUNT: '',
      APP_ROLLOUT_SURGE: '',
    })

    expect(collectProductionConfigProblems()).toEqual([
      'Connection budget: DATABASE_MAX_CONNECTIONS is not set.',
      'Connection budget: APP_PROCESS_COUNT is not set.',
      'Connection budget: APP_ROLLOUT_SURGE is not set.',
    ])
  })

  it('accepts a pool budget that fits', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      DATABASE_MAX_CONNECTIONS: '200',
      APP_PROCESS_COUNT: '3',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })
})

/**
 * The publication contract's half of the boot refusal.
 *
 * Every one of these used to be a quiet success. A deployment with no
 * frontend URL drained its whole refresh queue to `done` without telling the
 * frontend anything, because unconfigured delivery returned without an error.
 * `REFRESH_OUTBOX=off` reads like a safe revert and is a mode with known data
 * loss. Neither should be reachable by leaving one variable unset.
 */
describe('publication configuration', () => {
  beforeEach(() => {
    for (const name of [
      'QUESTURA_CLIENT_URL',
      'NEXT_PUBLIC_FRONTEND_URL',
      'FRONTEND_URL',
      'QUESTURA_REVALIDATION_SECRET',
      'REVALIDATION_SECRET',
      'REFRESH_DISCONNECTED',
      'REFRESH_OUTBOX',
      'REFRESH_OUTBOX_DEGRADED_ACK',
    ]) {
      vi.stubEnv(name, '')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('refuses a production boot with no frontend to revalidate', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      QUESTURA_CLIENT_URL: '',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('No frontend revalidation destination'),
    ])
  })

  it('refuses a production boot with no revalidation secret', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      QUESTURA_REVALIDATION_SECRET: '',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('QUESTURA_REVALIDATION_SECRET is not set'),
    ])
  })

  it('refuses the development disconnected mode in production', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      REFRESH_DISCONNECTED: '1',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('REFRESH_DISCONNECTED is set'),
    ])
  })

  it('refuses REFRESH_OUTBOX=off unless it is acknowledged as degraded', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      REFRESH_OUTBOX: 'off',
    })

    expect(collectProductionConfigProblems()).toEqual([
      expect.stringContaining('degraded emergency mode, not a rollback'),
    ])
  })

  it('allows the degraded mode once it is acknowledged by name', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      REFRESH_OUTBOX: 'off',
      REFRESH_OUTBOX_DEGRADED_ACK: 'outbox table locked, 2026-09-22, rebuild index after',
    })

    expect(collectProductionConfigProblems()).toEqual([])
  })
})

/**
 * A missing Resend key used to boot fine and fail the first password reset.
 * The sender was a hard-coded placeholder; it is now configured, and has to
 * be on the domain SPF, DKIM and DMARC are published for.
 */
describe('email configuration', () => {
  beforeEach(() => {
    for (const name of ['RESEND_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME', 'EMAIL_REPLY_TO']) {
      vi.stubEnv(name, '')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('refuses a production boot with no Resend key', async () => {
    const { collectProductionConfigProblems } = await load({ ...VALID_PRODUCTION_ENV, RESEND_API_KEY: '' })

    expect(collectProductionConfigProblems().join('\n')).toContain('RESEND_API_KEY is not set')
  })

  it('refuses a production boot with no sender', async () => {
    const { collectProductionConfigProblems } = await load({ ...VALID_PRODUCTION_ENV, EMAIL_FROM_ADDRESS: '' })

    expect(collectProductionConfigProblems().join('\n')).toContain('EMAIL_FROM_ADDRESS is not set')
  })

  it.each([
    ['hello@gmail.com'],
    ['hello@questurian.net'],
    ['hello@notquesturian.com'],
    ['onboarding@resend.dev'],
  ])('refuses a sender off the site domain (%s)', async (address) => {
    const { collectProductionConfigProblems } = await load({ ...VALID_PRODUCTION_ENV, EMAIL_FROM_ADDRESS: address })

    expect(collectProductionConfigProblems().join('\n')).toContain("not the site's domain questurian.com")
  })

  it.each([['Questurian <hello@questurian.com>'], ['hello'], ['a@questurian.com,b@questurian.com']])(
    'refuses a sender that is not one plain address (%s)',
    async (address) => {
      const { collectProductionConfigProblems } = await load({ ...VALID_PRODUCTION_ENV, EMAIL_FROM_ADDRESS: address })

      expect(collectProductionConfigProblems().join('\n')).toContain('EMAIL_FROM_ADDRESS is not a single email address')
    }
  )

  it.each([['hello@questurian.com'], ['noreply@send.questurian.com'], ['Hello@Questurian.COM']])(
    'accepts a sender on the site domain or a subdomain of it (%s)',
    async (address) => {
      const { collectProductionConfigProblems } = await load({
        ...VALID_PRODUCTION_ENV,
        NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
        EMAIL_FROM_ADDRESS: address,
      })

      expect(collectProductionConfigProblems()).toEqual([])
    }
  )

  it('accepts a reply-to on another domain, and refuses a malformed one', async () => {
    const ok = await load({ ...VALID_PRODUCTION_ENV, EMAIL_REPLY_TO: 'owner@gmail.com' })
    expect(ok.collectProductionConfigProblems()).toEqual([])

    const bad = await load({ ...VALID_PRODUCTION_ENV, EMAIL_REPLY_TO: 'not an address' })
    expect(bad.collectProductionConfigProblems().join('\n')).toContain('EMAIL_REPLY_TO is not a single email address')
  })

  it('refuses a sender name that would break the From header', async () => {
    const { collectProductionConfigProblems } = await load({ ...VALID_PRODUCTION_ENV, EMAIL_FROM_NAME: 'Q <x@evil.com>' })

    expect(collectProductionConfigProblems().join('\n')).toContain('EMAIL_FROM_NAME')
  })

  it('never puts the Resend key in the message', async () => {
    const { collectProductionConfigProblems } = await load({
      ...VALID_PRODUCTION_ENV,
      RESEND_API_KEY: 're_live_this-must-not-appear',
      EMAIL_FROM_ADDRESS: 'x@gmail.com',
    })

    expect(collectProductionConfigProblems().join('\n')).not.toContain('re_live_this')
  })
})
