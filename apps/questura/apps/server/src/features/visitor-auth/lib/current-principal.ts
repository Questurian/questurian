import { getVisitorAuthMethodsForUser } from './account-query'
import type { VisitorAuthMethods } from './account-query'
import { visitorAuth } from './better-auth'
import { deriveVisitorMembership } from './membership-entitlement'
import { sessionRevocations } from './session-revocations'
import { visitorSessionToken } from './session-cookie'
import type { VisitorMembership } from './membership-entitlement'
import { ensureVisitorProfileForAuthUser, findVisitorProfileByAuthUserId } from './visitor-profile'

export type VisitorPrincipal = {
  kind: 'visitor'
  id: string
  email: string
  emailVerified: boolean
  profileId: string | number | null
  firstName: string
  lastName: string
  // The whole derived membership, `graceUntil` included: the client reads it,
  // and the declared type had silently dropped it (apiContract.typecheck.ts).
  membership: VisitorMembership
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
   * Always check the session store, never the five-minute cookie copy. For
   * routes that move money or change a subscription. Other routes trust the
   * copy unless the reader had a session revoked recently
   * (`lookupVisitorSession`), so a revoked session ends within about a
   * second everywhere.
   */
  freshSession?: boolean
}

/**
 * The session behind these headers, or null.
 *
 * Better Auth answers from its signed five-minute cookie copy when it can
 * (`cookieCache`). Two cases go to the session store instead:
 *
 *  - the copy is not the session the token cookie names. Better Auth answers
 *    from a valid `session_data` cookie without checking it belongs to the
 *    `session_token` beside it, so one visitor's cache cookie with another's
 *    token read as the first visitor (`pnpm readiness:auth`);
 *  - the reader had a session revoked in the last few minutes (password
 *    change or reset, "sign out of all devices", sign-out). Without this a
 *    revoked device stayed signed in for up to five minutes
 *    (`session-revocations.ts`).
 *
 * Agreeing cookies of a reader with no recent revocation, the normal case,
 * cost nothing extra.
 */
export async function lookupVisitorSession(headers: Headers, options: PrincipalOptions = {}) {
  const fresh = () => visitorAuth.api.getSession({ headers, query: { disableCookieCache: true } })
  if (options.freshSession) return fresh()

  const visitorSession = await visitorAuth.api.getSession({ headers })
  if (!visitorSession?.session?.token) return visitorSession

  const signed = visitorSessionToken(headers)
  const token = signed ? decodeURIComponent(signed).split('.')[0] : null
  if (token !== visitorSession.session.token) return fresh()

  if (await sessionRevocations.isRecentlyRevoked(visitorSession.user.id)) return fresh()

  return visitorSession
}

async function resolveVisitorPrincipal(
  headers: Headers,
  options: PrincipalOptions = {},
): Promise<VisitorPrincipal | null> {
  const visitorSession = await lookupVisitorSession(headers, options)

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
  const visitorSession = await lookupVisitorSession(headers)
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
