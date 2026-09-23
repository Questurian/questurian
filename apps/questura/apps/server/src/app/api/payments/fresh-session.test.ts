import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Every payments route that resolves a visitor checks the session store, not
 * the five-minute cookie cache.
 *
 * The cookie cache (#650) means a session revoked on another device keeps
 * working for up to five minutes wherever the cache is trusted. That delay is
 * accepted for `/api/me` and reading, and kept away from money: each route
 * here passes `freshSession: true`. Dropping it from one route compiles, passes
 * every mocked route test, and silently reopens the window on that route — so
 * the rule is pinned on the source, like `cookie-auth-origin-guard.test.ts`.
 */
const PAYMENTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

function routeFiles(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full))
      continue
    }

    if (entry === 'route.ts') found.push(full)
  }

  return found
}

const PRINCIPAL_CALL = /\b(requireVisitorPrincipal|requireCurrentPrincipal|getCurrentPrincipal)\(([^)]*)\)/g

function principalCalls(): Array<{ route: string; call: string }> {
  return routeFiles(PAYMENTS_ROOT).flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return [...source.matchAll(PRINCIPAL_CALL)].map((match) => ({
      route: path.relative(PAYMENTS_ROOT, file),
      call: match[0],
    }))
  })
}

describe('payments routes and the session cookie cache', () => {
  it('resolve every visitor with freshSession: true', () => {
    const stale = principalCalls().filter(({ call }) => !/freshSession:\s*true/.test(call))

    expect(stale).toEqual([])
  })

  it('finds the routes it claims to scan', () => {
    // Checkout, portal, cancel, reactivate and subscription details. Without
    // this the test above passes just as happily when it finds nothing.
    const routes = new Set(principalCalls().map(({ route }) => route))

    expect([...routes].sort()).toEqual([
      'cancel-subscription/route.ts',
      'create-checkout-session/route.ts',
      'create-portal-session/route.ts',
      'reactivate-subscription/route.ts',
      'subscription-details/route.ts',
    ])
  })
})
