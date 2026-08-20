import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Every route that identifies its caller from the session cookie must state its
 * allowed origins.
 *
 * The rule is written down in `payments/subscription-details/route.ts`, and it
 * was written down because the alternative — arguing each route separately on
 * how hard it would be to read cross-origin — is how `/api/me` ended up being
 * the one identity route without the guard. "Hard to exploit" is not the
 * guarantee the others give.
 *
 * A route is cookie-authenticated if it imports `current-principal`. That is
 * the module that turns a cookie into a visitor, so importing it is the honest
 * signal, and a new route cannot opt out of this test without also opting out
 * of knowing who the caller is.
 */
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

function routeFiles(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full))
      continue
    }

    if (entry === 'route.ts' || entry === 'route.tsx') found.push(full)
  }

  return found
}

function cookieAuthRoutesWithoutOriginGuard(): string[] {
  return routeFiles(API_ROOT)
    .filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('current-principal') && !source.includes('forbiddenOriginResponse')
    })
    .map((file) => path.relative(API_ROOT, file))
}

describe('cookie-authenticated API routes', () => {
  it('all call forbiddenOriginResponse', () => {
    expect(cookieAuthRoutesWithoutOriginGuard()).toEqual([])
  })

  it('finds the routes it claims to scan', () => {
    // Without this the test above passes just as happily when the walk is
    // pointed at the wrong directory and finds nothing at all.
    const scanned = routeFiles(API_ROOT).filter((file) =>
      readFileSync(file, 'utf8').includes('current-principal')
    )

    expect(scanned.length).toBeGreaterThanOrEqual(7)
  })
})
