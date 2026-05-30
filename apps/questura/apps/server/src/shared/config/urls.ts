// URL configuration for Phase 1: Localhost-only development
// All services (frontend, backend, external services) use localhost
export const APP_URLS = {
  // Frontend URL (for redirects after login)
  frontend: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  // Backend URL (localhost for all services including Google OAuth, Stripe, etc.)
  backend: process.env.BACKEND_URL_LOCAL || 'http://localhost:4000',

  // Backend local URL (for admin panel and Payload CMS)
  backendLocal: process.env.BACKEND_URL_LOCAL || 'http://localhost:4000',

  /**
   * Constructs a frontend URL with the given path
   * @param path - The path to append (e.g., '/login', '/auth?token=xyz')
   * @returns Full frontend URL
   */
  frontendUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${this.frontend}${normalizedPath}`
  },

  /**
   * Constructs a backend URL with the given path
   * @param path - The path to append (e.g., '/api/users', '/api/visitor-auth/callback/google')
   * @returns Full backend URL
   */
  backendUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${this.backend}${normalizedPath}`
  }
} as const
