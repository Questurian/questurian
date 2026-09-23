import { getVisitorAuthMethodsForUser } from './account-query'
import type { VisitorAuthMethods } from './account-query'
import { visitorAuth } from './better-auth'
import { deriveVisitorMembership } from './membership-entitlement'
import type { MembershipSource } from './membership-entitlement'
import { ensureVisitorProfileForAuthUser, findVisitorProfileByAuthUserId } from './visitor-profile'

export type VisitorPrincipal = {
  kind: 'visitor'
  id: string
  email: string
  emailVerified: boolean
  profileId: string | number | null
  firstName: string
  lastName: string
  membership: {
    active: boolean
    source: MembershipSource
    status: string
    expiresAt: string | null
    cancelAtPeriodEnd: boolean
  }
}

/**
 * Sign-in methods are not part of the principal. Every gate and every
 * `/api/me` resolves a principal, and only the account page needs to know how
 * the reader signs in, so the accounts query is paid there alone
 * (`getCurrentAuthMethods`, served by `/api/account/auth-methods`).
 */

/**
 * Per ADR-0004 the public current-principal view covers Visitor auth only; Payload Staff auth is
 * deliberately ignored here so a browser logged into Payload admin does not become logged into the
 * public client.
 */
export type CurrentPrincipal = VisitorPrincipal

export type VisitorPrincipalResult =
  | { authenticated: true; principal: VisitorPrincipal }
  | { authenticated: false; principal: null }

export type CurrentPrincipalResult = VisitorPrincipalResult

function unauthenticated(): VisitorPrincipalResult {
  return {
    authenticated: false,
    principal: null,
  }
}

type PrincipalOptions = {
  /**
   * Skip the five-minute session cookie cache and check the session store, so
   * a session revoked on another device is refused at once. For routes that
   * move money or change a subscription.
   */
  freshSession?: boolean
}

async function resolveVisitorPrincipal(
  headers: Headers,
  options: PrincipalOptions = {},
): Promise<VisitorPrincipal | null> {
  const visitorSession = await visitorAuth.api.getSession({
    headers,
    ...(options.freshSession ? { query: { disableCookieCache: true } } : {}),
  })

  if (visitorSession?.user) {
    const user = visitorSession.user
    const foundProfile = await findVisitorProfileByAuthUserId(user.id)
    const profile =
      foundProfile ??
      (await ensureVisitorProfileForAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
      }))

    return {
      kind: 'visitor',
      id: visitorSession.user.id,
      email: visitorSession.user.email,
      emailVerified: Boolean(visitorSession.user.emailVerified),
      profileId: profile?.id ?? null,
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      membership: deriveVisitorMembership(profile),
    }
  }

  return null
}

export async function getCurrentPrincipal(
  headers: Headers,
  options: PrincipalOptions = {},
): Promise<VisitorPrincipalResult> {
  const visitor = await resolveVisitorPrincipal(headers, options)

  if (!visitor) return unauthenticated()

  return {
    authenticated: true,
    principal: visitor,
  }
}

/**
 * How the signed-in reader signs in, or null for no session. One session
 * lookup, then the accounts query with the user id it produced — never
 * `listUserAccounts({ headers })`, which would resolve the session again.
 */
export async function getCurrentAuthMethods(headers: Headers): Promise<VisitorAuthMethods | null> {
  const visitorSession = await visitorAuth.api.getSession({ headers })
  if (!visitorSession?.user) return null
  return getVisitorAuthMethodsForUser(visitorSession.user.id)
}

export async function requireCurrentPrincipal(headers: Headers, options: PrincipalOptions = {}) {
  const result = await getCurrentPrincipal(headers, options)
  if (!result.authenticated || !result.principal) {
    return { result, principal: null, error: 'Authentication required', status: 401 as const }
  }

  return { result, principal: result.principal, error: null, status: 200 as const }
}

export async function requireVisitorPrincipal(
  headers: Headers,
  options: { requireVerified?: boolean } & PrincipalOptions = {},
) {
  const current = await requireCurrentPrincipal(headers, { freshSession: options.freshSession })
  if (current.error || !current.principal) return current

  if (options.requireVerified && !current.principal.emailVerified) {
    return {
      result: current.result,
      principal: null,
      error: 'Email verification required',
      status: 403 as const,
    }
  }

  return {
    result: current.result,
    principal: current.principal,
    error: null,
    status: 200 as const,
  }
}
