/**
 * Centralized configuration for environment variables
 * Single source of truth for all app configuration
 */

export const config = {
  /**
   * Backend API URL
   * @default "http://localhost:4000"
   */
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",

  /**
   * Stripe publishable key
   */
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",

  /**
   * Application URL
   */
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "",

  /**
   * Frontend URL for CORS
   */
  frontendUrl: process.env.NEXT_PUBLIC_FRONTEND_URL || "",
} as const;
