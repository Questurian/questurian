import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { captcha } from 'better-auth/plugins'
import { getPayload } from 'payload'
import { Pool } from 'pg'

import config from '@/payload.config'
import { sendPasswordResetLinkEmail, sendVisitorEmailVerificationLinkEmail } from '@/emails'
import { syncStripeCustomerEmail } from '@/payments/lib/customer-linkage'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { normalizeEmail } from '@/shared/lib/normalize-email'
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

export const visitorAuth = betterAuth({
  appName: 'Questura',
  baseURL: APP_URLS.backend,
  basePath: '/api/visitor-auth',
  trustedOrigins: APP_CONFIG.CORS_ORIGINS,
  secret: process.env.BETTER_AUTH_SECRET || APP_CONFIG.payloadSecret,
  database: new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  }),
  secondaryStorage: APP_CONFIG.isProduction ? redisSecondaryStorage : undefined,
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
    storage: APP_CONFIG.isProduction ? 'secondary-storage' : 'database',
    modelName: 'visitor_auth_rate_limits',
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 5 },
      '/reset-password': { window: 60, max: 5 },
      '/send-verification-email': { window: 60, max: 3 },
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
      // One header, chosen by `TRUSTED_PROXY`, matching `getClientIp`. Better
      // Auth takes the first header present in this list, so listing several
      // would let a caller pick which one identifies them. `x-forwarded-for`
      // remains only as the development fallback, where nothing fronts the app.
      ipAddressHeaders: APP_CONFIG.trustedProxy.header
        ? [APP_CONFIG.trustedProxy.header]
        : ['x-forwarded-for', 'x-real-ip'],
      disableIpTracking: false,
    },
  },
})

export type VisitorAuthSession = typeof visitorAuth.$Infer.Session
