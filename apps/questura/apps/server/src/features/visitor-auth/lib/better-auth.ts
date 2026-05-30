import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { captcha } from 'better-auth/plugins'
import { getPayload } from 'payload'
import { Pool } from 'pg'

import config from '@/payload.config'
import { sendPasswordResetLinkEmail, sendVisitorEmailVerificationLinkEmail } from '@/emails'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { redisSecondaryStorage } from './redis-secondary-storage'
import { auditVisitorAuthSecurityEvent } from './security-audit'
import { isStaffEmail, normalizeEmail } from './staff-email-guard'
import { ensureVisitorProfileForAuthUser, updateVisitorProfileByAuthUserId } from './visitor-profile'

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

function splitDisplayName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
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
            if (await isStaffEmail(email)) {
              auditVisitorAuthSecurityEvent({
                type: 'visitor_auth_staff_email_blocked',
                email,
                path: '/callback/google',
              })
              throw new APIError('FORBIDDEN', {
                message: 'Please use the staff login.',
              })
            }

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
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'email-password'],
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
      await updateVisitorProfileByAuthUserId(user.id, {
        email: normalizeEmail(user.email),
      })
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
      if (ctx.path === '/change-email') {
        const accounts = await visitorAuth.api.listUserAccounts({ headers: ctx.headers })
        if (accounts.some((account) => account.providerId === 'google')) {
          throw new APIError('BAD_REQUEST', {
            message: 'Disconnect Google before changing your email address.',
          })
        }
      }

      if (
        ctx.path === '/sign-up/email' ||
        ctx.path === '/sign-in/social' ||
        ctx.path === '/link-social' ||
        ctx.path === '/change-email'
      ) {
        const email = normalizeEmail(ctx.path === '/change-email' ? ctx.body?.newEmail : ctx.body?.email)
        if (email && (await isStaffEmail(email))) {
          auditVisitorAuthSecurityEvent({
            type: 'visitor_auth_staff_email_blocked',
            email,
            path: ctx.path,
          })
          throw new APIError('FORBIDDEN', {
            message: 'Please use the staff login.',
          })
        }
      }
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
      ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
      disableIpTracking: false,
    },
  },
})

export type VisitorAuthSession = typeof visitorAuth.$Infer.Session
