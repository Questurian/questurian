import { APP_URLS } from './urls'

// Centralized application configuration
const corsOrigins = [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:3000', // Ensure localhost:3000 is always included for local dev
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  ...(process.env.NEXT_PUBLIC_FRONTEND_URL ? [process.env.NEXT_PUBLIC_FRONTEND_URL] : []), // For deployed frontend on Vercel, etc.
  ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []), // Additional origins from env (e.g., "https://www.questurian.com,https://questurian.com")
] as string[]

export const APP_CONFIG = {
  // CORS Configuration - includes frontend and backend URLs
  CORS_ORIGINS: corsOrigins,

  // Security & Authentication
  payloadSecret: process.env.PAYLOAD_SECRET || '',

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
    priceId: process.env.STRIPE_PRICE_ID || '',
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
