import { betterAuth } from 'better-auth'
import { applicationName } from '@/shared/database/fleet-manifest'
import { poolSizes } from '@/shared/database/pool-budget'
import { poolTimeoutOptions, servingTimeouts } from '@/shared/database/timeouts'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { captcha } from 'better-auth/plugins'
import { getPayload } from 'payload'
import { Pool } from 'pg'

import config from '@/payload.config'
import { sendPasswordResetLinkEmail, sendVisitorEmailVerificationLinkEmail } from '@/emails'
import { syncStripeCustomerEmail } from '@/payments/lib/customer-linkage'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { normalizeEmail } from '@/shared/lib/normalize-email'
import { VISITOR_AUTH_CLIENT_IP_HEADER } from './client-identity'
import { redisSecondaryStorage } from './redis-secondary-storage'
import { getVisitorPasswordError } from './visitor-password-guard'
import { ensureVisitorProfileForAuthUser, splitDisplayName, updateVisitorProfileByAuthUserId } from './visitor-profile'
import { rejectStaffEmailForVisitorAuth } from './visitor-staff-email-boundary'

const databaseUrl = APP_CONFIG.database.uri

if (!databaseUrl) {
  throw new Error('DATABASE_URI is required for BetterAuth visitor auth spike')
}

if (APP_CONFIG.isProduction && !APP_CONFIG.redis.url) {
  throw new Error('REDIS_URL is required for production Visitor auth rate limiting')
}

if (APP_CONFIG.isProduction && APP_CONFIG.turnstile.enabled && !APP_CONFIG.turnstile.secretKey) {
  throw new Error('TURNSTILE_SECRET_KEY is required when Visitor auth bot protection is enabled')
}

const googleProvider =
  APP_CONFIG.google.clientId && APP_CONFIG.google.clientSecret
    ? {
        google: {
          clientId: APP_CONFIG.google.clientId,
          clientSecret: APP_CONFIG.google.clientSecret,
          redirectURI: `${APP_URLS.backend}/api/visitor-auth/callback/google`,
          mapProfileToUser: async (profile: { email?: string; email_verified?: boolean }) => {
            const email = normalizeEmail(profile.email)
            await rejectStaffEmailForVisitorAuth({ path: '/callback/google', email })

            return {
              email,
              emailVerified: Boolean(profile.email_verified),
            }
          },
        },
      }
    : undefined

/**
 * Exported so `/api/me` can count the statements a session lookup sends
 * (`Server-Timing`, diagnostics only).
 */
export const visitorAuthPool = new Pool({
  connectionString: databaseUrl,
  // See shared/database/fleet-manifest.ts: observed connections have to be
  // reconcilable with the pools that were supposed to open them.
  application_name: applicationName('visitorAuth'),
  max: poolSizes().visitorAuth,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Same statement, lock and idle budgets as Payload's pool: a session
  // lookup that hangs holds one of ten connections and stalls sign-in.
  ...poolTimeoutOptions(servingTimeouts()),
})

export const visitorAuth = betterAuth({
  appName: 'Questura',
  baseURL: APP_URLS.backend,
  basePath: '/api/visitor-auth',
  trustedOrigins: APP_CONFIG.CORS_ORIGINS,
  secret: process.env.BETTER_AUTH_SECRET || APP_CONFIG.payloadSecret,
  database: visitorAuthPool,
  // Keyed on whether Redis is configured, not on the environment, so a local
  // run with REDIS_URL exercises the same session path production does.
  // Production still refuses to boot without REDIS_URL (above).
  secondaryStorage: APP_CONFIG.redis.url ? redisSecondaryStorage : undefined,
  user: {
    modelName: 'visitor_auth_users',
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
    },
  },
  session: {
    modelName: 'visitor_auth_sessions',
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    // Redis stays the fast path; Postgres keeps the durable copy. Without it a
    // Redis flush, eviction or provider incident signed every reader out at
    // once. Better Auth reads Redis first and falls back to the table on a
    // miss, so the cost is a write at sign-in and refresh, not a read per page.
    storeSessionInDatabase: true,
    // A signed copy of the session in the reader's own cookie, trusted for
    // five minutes, so most `/api/me` calls skip the session store. The price:
    // a session revoked elsewhere (password change or reset signs out other
    // devices) keeps working for up to five minutes on those devices. Payment
    // routes and the paid article body opt out and always check the store
    // (`freshSession`).
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    modelName: 'visitor_auth_accounts',
    encryptOAuthTokens: true,
    storeStateStrategy: 'database',
    // `trustedProviders` is only ever compared against an OAuth provider id
    // (Better Auth checks it in the OAuth callback, the implicit-link path and
    // `linkAccount`), so listing `email-password` here did nothing — it read
    // like a decision to trust password accounts for linking while having no
    // effect at all.
    //
    // What actually protects this surface is `requireLocalEmailVerified`, which
    // defaults to true: signing in with Google cannot implicitly link onto an
    // existing local account whose address was never verified. That is what
    // stops someone registering a stranger's address with a password and
    // waiting to inherit the session — and the subscription — they later create
    // with Google. Left at its default deliberately; stated here because the
    // default is doing security work and is easy to switch off by accident.
    accountLinking: {
      enabled: true,
      // Linking is explicit only. Signing in with Google will never attach
      // itself to an account that already exists under that address; the
      // visitor signs in the way that account was made and connects Google from
      // their account page, which goes through `link-social` and is unaffected
      // by this flag.
      //
      // `requireLocalEmailVerified` already refused to link onto an *unverified*
      // local account, which closed the obvious version of this. What it could
      // not close is that `sendOnSignUp` mails a genuine verification link to
      // whatever address was registered — so someone who signs up as a stranger
      // gets that stranger to do the verifying for them, and inherits the
      // account, its billing portal and its subscription the moment the real
      // owner tries Google. Implicit linking is the only thing that turns
      // "someone typed your address" into "someone is in your account", and it
      // buys one saved click.
      disableImplicitLinking: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    },
  },
  verification: {
    modelName: 'visitor_auth_verifications',
    storeIdentifier: 'hashed',
    storeInDatabase: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const payload = await getPayload({ config })
      const { firstName, lastName } = splitDisplayName(user.name)

      const result = await sendPasswordResetLinkEmail(payload, {
        email: user.email,
        firstName,
        lastName,
        url,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send password reset email')
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Inert while `requireEmailVerification` is false: Better Auth only sends
    // on sign-in when that flag blocks an unverified sign-in. Kept so turning
    // the flag on also re-sends the link, rather than leaving the reader stuck.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const payload = await getPayload({ config })
      const { firstName, lastName } = splitDisplayName(user.name)

      const result = await sendVisitorEmailVerificationLinkEmail(payload, {
        email: user.email,
        firstName,
        lastName,
        url,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email verification')
      }
    },
    afterEmailVerification: async (user) => {
      const email = normalizeEmail(user.email)
      const profile = await updateVisitorProfileByAuthUserId(user.id, { email })

      // This is also where an email *change* lands, and Stripe never learns of
      // one on its own: a customer's address is written at creation and left
      // there. Leaving it stale strands the old address on a live customer,
      // where the next person to register it could be mistaken for its owner.
      await syncStripeCustomerEmail(
        typeof profile?.stripeCustomerId === 'string' ? profile.stripeCustomerId : null,
        email
      )
    },
  },
  socialProviders: googleProvider,
  plugins: APP_CONFIG.isProduction && APP_CONFIG.turnstile.enabled
    ? [
        captcha({
          provider: 'cloudflare-turnstile',
          secretKey: APP_CONFIG.turnstile.secretKey,
          endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
        }),
      ]
    : [],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: APP_CONFIG.redis.url ? 'secondary-storage' : 'database',
    modelName: 'visitor_auth_rate_limits',
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 5 },
      '/reset-password': { window: 60, max: 5 },
      '/send-verification-email': { window: 60, max: 3 },
      '/change-password': { window: 60, max: 5 },
      '/change-email': { window: 60, max: 3 },
      '/sign-in/social': { window: 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Password strength, enforced server-side against the shared rule in
      // `shared/lib/password-strength`. `minPasswordLength` below only sets a
      // length floor; the character-class requirements the sign-up UI shows
      // were checked in the browser only, so a direct API call bypassed them.
      // Payload's staff half enforces the same module via a beforeValidate hook.
      const passwordError = getVisitorPasswordError(ctx.path, ctx.body)
      if (passwordError) {
        throw new APIError('BAD_REQUEST', { message: passwordError })
      }

      if (ctx.path === '/change-email') {
        const accounts = await visitorAuth.api.listUserAccounts({ headers: ctx.headers })
        if (accounts.some((account) => account.providerId === 'google')) {
          throw new APIError('BAD_REQUEST', {
            message: 'Disconnect Google before changing your email address.',
          })
        }
      }

      await rejectStaffEmailForVisitorAuth({ path: ctx.path, body: ctx.body })
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith('/sign-up') && !ctx.path.startsWith('/callback')) {
        return
      }

      const user = ctx.context.newSession?.user
      if (!user) return

      await ensureVisitorProfileForAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
      })
    }),
  },
  advanced: {
    cookiePrefix: 'questura_visitor',
    useSecureCookies: APP_CONFIG.isProduction,
    ipAddress: {
      // One header, written by the visitor-auth route from `getClientIp` and
      // overwritten on every request, so Better Auth and our own limiters see
      // one caller the same way. Reading the proxy header directly let a
      // request without it skip Better Auth's limiter in production
      // (`client-identity.ts`).
      ipAddressHeaders: [VISITOR_AUTH_CLIENT_IP_HEADER],
      disableIpTracking: false,
    },
  },
})

export type VisitorAuthSession = typeof visitorAuth.$Infer.Session
