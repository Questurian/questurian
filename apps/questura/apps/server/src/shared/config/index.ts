import { APP_URLS } from './urls'
import { readCookieDomain, resolveSessionCookieConfig } from './session-cookie'
import { resolveTrustedProxyHeader } from './trusted-proxy'

// Centralized application configuration

const isProductionEnv = process.env.NODE_ENV === 'production'

/**
 * Local development origins.
 *
 * This one array feeds Payload `cors`, Payload `csrf` AND Better Auth
 * `trustedOrigins` (which gates OAuth `callbackURL` validation), so a localhost
 * entry surviving into production would widen all three at once. They are
 * therefore included only outside production; production must supply its real
 * origins through the env vars below.
 */
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:4000',
]

/**
 * An `Origin` header never carries a trailing slash, so an entry like
 * `http://localhost:3000/` silently never matches. Normalize rather than rely
 * on every env var being written without one.
 */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

const configuredOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  // For a deployed frontend on Vercel, etc.
  process.env.NEXT_PUBLIC_FRONTEND_URL,
  // Additional origins, e.g. "https://www.questurian.com,https://questurian.com"
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? []),
]
  .filter((origin): origin is string => Boolean(origin && origin.trim()))
  .map(normalizeOrigin)

const corsOrigins = Array.from(
  new Set([...configuredOrigins, ...(isProductionEnv ? [] : DEV_ORIGINS)])
) as string[]

export const APP_CONFIG = {
  // CORS Configuration - includes frontend and backend URLs
  CORS_ORIGINS: corsOrigins,

  // Security & Authentication
  payloadSecret: process.env.PAYLOAD_SECRET || '',

  // Scope of the Payload staff session cookie. See ./session-cookie.ts for why
  // the `Domain` has to widen to the registrable domain in production.
  sessionCookie: resolveSessionCookieConfig({
    isProduction: isProductionEnv,
    domain: readCookieDomain(process.env.PAYLOAD_COOKIE_DOMAIN),
  }),

  // Google OAuth Configuration (the redirect URI is built where the provider
  // is configured, in visitor-auth/lib/better-auth.ts)
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  // Stripe Configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // `STRIPE_PRICE_ID` is the pre-plan monthly fallback. Laptop $0.50 vs
    // catalog $12.99 / $79.99 is a host env switch — docs/membership-pricing.md.
    priceId: process.env.STRIPE_PRICE_ID || '',
    monthlyPriceId: process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID || '',
    yearlyPriceId: process.env.STRIPE_PRICE_ID_YEARLY || '',
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL || '', // Optional: Custom return URL for Customer Portal
  },

  // Database Configuration
  database: {
    uri: process.env.DATABASE_URI || '',
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || '',
  },

  // Which proxy fronts this deployment. Names the one header allowed to
  // identify a caller; see `trusted-proxy.ts` for why this is configured
  // rather than sniffed. Required in production.
  trustedProxy: {
    name: process.env.TRUSTED_PROXY || '',
    header: resolveTrustedProxyHeader(process.env.TRUSTED_PROXY),
  },

  // Email Configuration
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
  },

  // Bot Protection
  turnstile: {
    enabled: process.env.TURNSTILE_AUTH_ENABLED === 'true',
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
  },

  // Feature Flags
  features: {
    // Transactional-email delivery log (email-logs collection). On by default;
    // set EMAIL_TRACKING=false to stop recording without touching send paths.
    emailTracking: process.env.EMAIL_TRACKING !== 'false',
    enforcePasswordStrength: process.env.ENFORCE_PASSWORD_STRENGTH !== 'false',
    endorselyAffiliates: process.env.ENDORSELY_ENABLED === 'true',
    // Whether Checkout shows the "add promotion code" box. Opt-in, because
    // `allow_promotion_codes: true` makes *every* active code in the Stripe
    // account redeemable by anyone on any plan — a single unrestricted 100%-off
    // code is a permanent free membership for whoever learns it. Turn this on
    // deliberately, once the live codes carry their own restrictions
    // (`first_time_transaction`, an applies-to price, a redemption cap).
    stripePromotionCodes: process.env.STRIPE_PROMOTION_CODES === 'true',
    homepageFeaturedAllowDrafts: process.env.HOMEPAGE_FEATURED_ALLOW_DRAFTS === 'true',
  },

  // Backend URL - localhost for Phase 1
  backendUrl: process.env.BACKEND_URL_LOCAL || 'http://localhost:4000',

  // Environment Detection
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
} as const

// Re-export URL utilities for convenience
export { APP_URLS }
