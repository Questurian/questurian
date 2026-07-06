import { getPayload } from 'payload'

import config from '@/payload.config'
import { visitorAuth } from './better-auth'
import { ensureVisitorProfileForAuthUser, findVisitorProfileByAuthUserId } from './visitor-profile'

type MembershipSource = 'stripe' | 'staff_grant' | null
type AuthProvider = 'local' | 'google' | 'dual' | 'unknown'
type StaffRole = 'admin' | 'editor' | 'writer'

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

export type StaffPrincipal = {
  kind: 'staff'
  id: string | number
  email: string
  role: StaffRole
  membership: {
    active: boolean
    source: MembershipSource
  }
}

export type CurrentPrincipal = VisitorPrincipal | StaffPrincipal

type PrincipalResult<T extends CurrentPrincipal> =
  | { authenticated: true; principal: T }
  | { authenticated: false; principal: null }

export type CurrentPrincipalResult = PrincipalResult<CurrentPrincipal>
export type VisitorPrincipalResult = PrincipalResult<VisitorPrincipal>
export type StaffPrincipalResult = PrincipalResult<StaffPrincipal>

const STAFF_ROLES = ['admin', 'editor', 'writer'] as const

function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && STAFF_ROLES.includes(role as StaffRole)
}

function unauthenticated<T extends CurrentPrincipal>(): PrincipalResult<T> {
  return {
    authenticated: false,
    principal: null,
  }
}

function hasActiveStripeMembership(profile: any): boolean {
  if (!profile) return false
  if (profile.subscriptionStatus === 'active') return true

  if (
    (profile.subscriptionStatus === 'cancelled' || profile.subscriptionStatus === 'none') &&
    profile.membershipExpiration
  ) {
    return new Date(profile.membershipExpiration) > new Date()
  }

  return false
}

function getStaffMembership(role: StaffRole | undefined): { active: boolean; source: MembershipSource } {
  if (role === 'admin' || role === 'editor') {
    return { active: true, source: 'staff_grant' }
  }

  return { active: false, source: null }
}

async function getVisitorAuthMethods(headers: Headers): Promise<{
  hasLocalPassword: boolean
  hasGoogleOAuth: boolean
  authProvider: AuthProvider
}> {
  try {
    const accounts = await visitorAuth.api.listUserAccounts({ headers })
    const hasLocalPassword = accounts.some((account) => account.providerId === 'credential')
    const hasGoogleOAuth = accounts.some((account) => account.providerId === 'google')

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
  } catch (error) {
    console.error('Failed to resolve Visitor auth methods:', error)
    return {
      hasLocalPassword: false,
      hasGoogleOAuth: false,
      authProvider: 'unknown',
    }
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
    const active = hasActiveStripeMembership(profile)
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
      membership: {
        active,
        source: active ? 'stripe' : null,
        status: profile?.subscriptionStatus ?? 'none',
        expiresAt: profile?.membershipExpiration ?? null,
        cancelAtPeriodEnd: Boolean(profile?.cancelAtPeriodEnd),
      },
    }
  }

  return null
}

async function resolveStaffPrincipal(headers: Headers): Promise<StaffPrincipal | null> {
  const payload = await getPayload({ config })
  const staffAuth = await payload.auth({ headers })
  const staff = staffAuth.user

  if (!staff || !isStaffRole(staff.role)) {
    return null
  }

  return {
    kind: 'staff',
    id: staff.id,
    email: staff.email,
    role: staff.role,
    membership: getStaffMembership(staff.role),
  }
}

export async function getCurrentPrincipal(headers: Headers): Promise<VisitorPrincipalResult> {
  const visitor = await resolveVisitorPrincipal(headers)

  if (!visitor) return unauthenticated()

  return {
    authenticated: true,
    principal: visitor,
  }
}

export async function getStaffPrincipal(headers: Headers): Promise<StaffPrincipalResult> {
  const staff = await resolveStaffPrincipal(headers)

  if (!staff) return unauthenticated()

  return {
    authenticated: true,
    principal: staff,
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

  if (current.principal.kind !== 'visitor') {
    return {
      result: current.result,
      principal: null,
      error: 'Visitor account required',
      status: 403 as const,
    }
  }

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

export async function requireStaffPrincipal(headers: Headers, roles: Array<'admin' | 'editor' | 'writer'>) {
  const result = await getStaffPrincipal(headers)
  if (!result.authenticated || !result.principal) {
    return { result, principal: null, error: 'Authentication required', status: 401 as const }
  }

  const role = result.principal.role
  if (!role || !roles.includes(role)) {
    return {
      result,
      principal: null,
      error: `Access denied. Required roles: ${roles.join(', ')}`,
      status: 403 as const,
    }
  }

  return {
    result,
    principal: result.principal,
    error: null,
    status: 200 as const,
  }
}
