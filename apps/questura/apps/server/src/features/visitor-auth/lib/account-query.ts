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
