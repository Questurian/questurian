import { findVisitorAccountByEmail } from './account-query'
import type { AuthProvider, VisitorAccountLookup } from './account-query'
import { normalizeEmail } from '@/shared/lib/normalize-email'

export type LegacyAccountCheckResult = {
  exists: boolean
  authMethods: {
    local: boolean
    google: boolean
    hasPassword: boolean
    hasGoogle: boolean
  }
  user: {
    role: 'visitor'
    authProvider: AuthProvider
    isProtected: false
  } | null
}

export function assertValidEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.trim()) {
    throw new Error('Email is required')
  }

  const normalized = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address')
  }

  return normalized
}

export function accountCheckFromLookup(lookup: VisitorAccountLookup): LegacyAccountCheckResult {
  if (!lookup.exists) {
    return {
      exists: false,
      authMethods: {
        local: false,
        google: false,
        hasPassword: false,
        hasGoogle: false,
      },
      user: null,
    }
  }

  const { hasLocalPassword, hasGoogleOAuth, authProvider } = lookup.methods

  return {
    exists: true,
    authMethods: {
      local: hasLocalPassword,
      google: hasGoogleOAuth,
      hasPassword: hasLocalPassword,
      hasGoogle: hasGoogleOAuth,
    },
    user: {
      role: 'visitor',
      authProvider,
      isProtected: false,
    },
  }
}

export async function checkVisitorAccount(email: unknown): Promise<LegacyAccountCheckResult> {
  const normalized = assertValidEmail(email)
  return accountCheckFromLookup(await findVisitorAccountByEmail(normalized))
}

export async function parseJsonResponse(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}
