import { visitorAuth } from './better-auth'

export type AuthProvider = 'local' | 'google' | 'dual' | 'unknown'

export type VisitorAuthMethods = {
  hasLocalPassword: boolean
  hasGoogleOAuth: boolean
  authProvider: AuthProvider
}

export type VisitorAccountLookup =
  | { exists: false; methods: null }
  | { exists: true; methods: VisitorAuthMethods }

export function deriveAuthMethods(providerIds: Array<string | null | undefined>): VisitorAuthMethods {
  const providers = new Set(providerIds.filter(Boolean))
  const hasLocalPassword = providers.has('credential')
  const hasGoogleOAuth = providers.has('google')

  return {
    hasLocalPassword,
    hasGoogleOAuth,
    authProvider:
      hasLocalPassword && hasGoogleOAuth
        ? 'dual'
        : hasLocalPassword
          ? 'local'
          : hasGoogleOAuth
            ? 'google'
            : 'unknown',
  }
}

export async function findVisitorAccountByEmail(email: string): Promise<VisitorAccountLookup> {
  const { internalAdapter } = await visitorAuth.$context
  const found = await internalAdapter.findUserByEmail(email, { includeAccounts: true })

  if (!found) return { exists: false, methods: null }

  return {
    exists: true,
    methods: deriveAuthMethods(found.accounts.map((account) => account.providerId)),
  }
}

/**
 * Sign-in methods for a user whose session has already been resolved.
 *
 * `/api/me` used to call `listUserAccounts({ headers })` for this, which runs
 * Better Auth's session middleware again: a second session lookup (a Redis
 * read in production, and whatever refresh check comes with it) on every
 * signed-in page view, to learn a user id the caller already had. This is the
 * accounts query alone.
 */
export async function getVisitorAuthMethodsForUser(userId: string): Promise<VisitorAuthMethods> {
  try {
    const { internalAdapter } = await visitorAuth.$context
    const accounts = await internalAdapter.findAccounts(userId)
    return deriveAuthMethods(accounts.map((account) => account.providerId))
  } catch (error) {
    console.error('Failed to resolve Visitor auth methods:', error)
    return {
      hasLocalPassword: false,
      hasGoogleOAuth: false,
      authProvider: 'unknown',
    }
  }
}

export async function getVisitorAuthMethods(headers: Headers): Promise<VisitorAuthMethods> {
  try {
    const accounts = await visitorAuth.api.listUserAccounts({ headers })
    return deriveAuthMethods(accounts.map((account) => account.providerId))
  } catch (error) {
    console.error('Failed to resolve Visitor auth methods:', error)
    return {
      hasLocalPassword: false,
      hasGoogleOAuth: false,
      authProvider: 'unknown',
    }
  }
}
