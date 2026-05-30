import { Pool } from 'pg'

import { APP_CONFIG, APP_URLS } from '@/shared/config'
import type { CurrentPrincipal } from './current-principal'
import { normalizeEmail } from './staff-email-guard'

type VisitorAccountRow = {
  id: string
  email: string
  role?: string | null
  providerId?: string | null
}

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
    authProvider: 'local' | 'google' | 'dual' | 'unknown'
    isProtected: false
  } | null
}

let legacyAuthPool: Pool | null = null

function getLegacyAuthPool() {
  if (legacyAuthPool) return legacyAuthPool
  if (!APP_CONFIG.database.uri) {
    throw new Error('DATABASE_URI is required for Visitor auth account checks')
  }

  legacyAuthPool = new Pool({
    connectionString: APP_CONFIG.database.uri,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  return legacyAuthPool
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

export function accountCheckFromRows(rows: VisitorAccountRow[]): LegacyAccountCheckResult {
  if (rows.length === 0) {
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

  const providerIds = new Set(rows.map((row) => row.providerId).filter(Boolean))
  const hasPassword = providerIds.has('credential')
  const hasGoogle = providerIds.has('google')
  const authProvider = hasPassword && hasGoogle
    ? 'dual'
    : hasPassword
      ? 'local'
      : hasGoogle
        ? 'google'
        : 'unknown'

  return {
    exists: true,
    authMethods: {
      local: hasPassword,
      google: hasGoogle,
      hasPassword,
      hasGoogle,
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
  const result = await getLegacyAuthPool().query<VisitorAccountRow>(
    `
      SELECT
        u."id",
        u."email",
        a."providerId"
      FROM "visitor_auth_users" u
      LEFT JOIN "visitor_auth_accounts" a ON a."userId" = u."id"
      WHERE u."email" = $1
    `,
    [normalized]
  )

  return accountCheckFromRows(result.rows)
}

export function legacyUserFromPrincipal(principal: CurrentPrincipal | null) {
  if (!principal) return null

  if (principal.kind === 'staff') {
    return {
      ...principal,
      membershipStatusSummary: principal.membership.active ? 'active' : 'none',
      subscriptionStatus: principal.membership.active ? 'active' : 'none',
    }
  }

  return {
    ...principal,
    membershipStatusSummary: principal.membership.active
      ? 'active'
      : principal.membership.status,
    subscriptionStatus: principal.membership.status,
    membershipExpiration: principal.membership.expiresAt,
    cancelAtPeriodEnd: principal.membership.cancelAtPeriodEnd,
  }
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

export function responseWithCors(req: Request, data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  const origin = req.headers.get('origin')
  const corsOrigin = APP_CONFIG.CORS_ORIGINS.includes(origin || '') ? origin : APP_URLS.frontend
  headers.set('Access-Control-Allow-Origin', corsOrigin!)
  headers.set('Access-Control-Allow-Credentials', 'true')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, ngrok-skip-browser-warning, x-captcha-response')
  headers.set('Content-Type', 'application/json')

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}
