import { getPayload } from 'payload'

import config from '@/payload.config'
import { visitorAuth } from './better-auth'
import { ensureVisitorProfileForAuthUser, findVisitorProfileByAuthUserId } from './visitor-profile'

type MembershipSource = 'stripe' | 'staff_grant' | null

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

function getStaffMembership(role: string | undefined): { active: boolean; source: MembershipSource } {
  if (role === 'admin' || role === 'editor') {
    return { active: true, source: 'staff_grant' }
  }

  return { active: false, source: null }
}

async function getVisitorAuthMethods(headers: Headers): Promise<{
  hasLocalPassword: boolean
  hasGoogleOAuth: boolean
  authProvider: 'local' | 'google' | 'dual' | 'unknown'
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

export async function getCurrentPrincipal(headers: Headers) {
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
      authenticated: true,
      principal: {
        kind: 'visitor' as const,
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
      },
    }
  }

  const payload = await getPayload({ config })
  const staffAuth = await payload.auth({ headers })
  const staff = staffAuth.user

  if (
    staff &&
    (staff.role === 'admin' || staff.role === 'editor' || staff.role === 'writer')
  ) {
    return {
      authenticated: true,
      principal: {
        kind: 'staff' as const,
        id: staff.id,
        email: staff.email,
        role: staff.role,
        membership: getStaffMembership(staff.role),
      },
    }
  }

  return {
    authenticated: false,
    principal: null,
  }
}

export type CurrentPrincipalResult = Awaited<ReturnType<typeof getCurrentPrincipal>>
export type CurrentPrincipal = NonNullable<CurrentPrincipalResult['principal']>
export type VisitorPrincipal = Extract<CurrentPrincipal, { kind: 'visitor' }>
export type StaffPrincipal = Extract<CurrentPrincipal, { kind: 'staff' }>

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
  const current = await requireCurrentPrincipal(headers)
  if (current.error || !current.principal) return current

  if (current.principal.kind !== 'staff') {
    return {
      result: current.result,
      principal: null,
      error: `Access denied. Required roles: ${roles.join(', ')}`,
      status: 403 as const,
    }
  }

  const role = current.principal.role
  if (!role || !roles.includes(role)) {
    return {
      result: current.result,
      principal: null,
      error: `Access denied. Required roles: ${roles.join(', ')}`,
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
