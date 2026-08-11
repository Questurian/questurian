import { getVisitorAuthMethods } from './account-query'
import type { AuthProvider } from './account-query'
import { visitorAuth } from './better-auth'
import { deriveVisitorMembership } from './membership-entitlement'
import type { MembershipSource } from './membership-entitlement'
import { ensureVisitorProfileForAuthUser, findVisitorProfileByAuthUserId } from './visitor-profile'

export type VisitorPrincipal = {
  kind: 'visitor'
  id: string
  email: string
  emailVerified: boolean
  hasLocalPassword: boolean
  hasGoogleOAuth: boolean
  authProvider: AuthProvider
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

async function resolveVisitorPrincipal(headers: Headers): Promise<VisitorPrincipal | null> {
  const visitorSession = await visitorAuth.api.getSession({ headers })

  if (visitorSession?.user) {
    const profile =
      (await findVisitorProfileByAuthUserId(visitorSession.user.id)) ??
      (await ensureVisitorProfileForAuthUser({
        id: visitorSession.user.id,
        email: visitorSession.user.email,
        name: visitorSession.user.name,
      }))
    const authMethods = await getVisitorAuthMethods(headers)

    return {
      kind: 'visitor',
      id: visitorSession.user.id,
      email: visitorSession.user.email,
      emailVerified: Boolean(visitorSession.user.emailVerified),
      ...authMethods,
      profileId: profile?.id ?? null,
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      membership: deriveVisitorMembership(profile),
    }
  }

  return null
}

export async function getCurrentPrincipal(headers: Headers): Promise<VisitorPrincipalResult> {
  const visitor = await resolveVisitorPrincipal(headers)

  if (!visitor) return unauthenticated()

  return {
    authenticated: true,
    principal: visitor,
  }
}

export async function requireCurrentPrincipal(headers: Headers) {
  const result = await getCurrentPrincipal(headers)
  if (!result.authenticated || !result.principal) {
    return { result, principal: null, error: 'Authentication required', status: 401 as const }
  }

  return { result, principal: result.principal, error: null, status: 200 as const }
}

export async function requireVisitorPrincipal(headers: Headers, options: { requireVerified?: boolean } = {}) {
  const current = await requireCurrentPrincipal(headers)
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
