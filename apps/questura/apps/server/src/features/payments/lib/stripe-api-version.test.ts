import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { STRIPE_API_VERSION } from './stripe-api-version'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SCANNED_DIRS = ['src', 'scripts']
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'migrations'])

/**
 * How much text after `new Stripe(` still counts as the same call. The options
 * object is always the second argument, so anything further away belongs to
 * different code.
 */
const OPTIONS_WINDOW = 400

function walk(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue

    const full = path.join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...walk(full))
      continue
    }

    if (!/\.(ts|tsx|mts|cts)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue

    found.push(full)
  }

  return found
}

/**
 * Drop block comments and whole-line `//` comments, so prose *about* a Stripe
 * client — this file's own doc comment included — is not read as one.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
}

function clientsWithoutApiVersion(): string[] {
  const offenders: string[] = []

  for (const dir of SCANNED_DIRS) {
    for (const file of walk(path.join(SERVER_ROOT, dir))) {
      const source = withoutComments(readFileSync(file, 'utf8'))
      const chunks = source.split('new Stripe(').slice(1)

      for (const chunk of chunks) {
        if (chunk.slice(0, OPTIONS_WINDOW).includes('apiVersion')) continue
        offenders.push(path.relative(SERVER_ROOT, file))
      }
    }
  }

  return offenders
}

describe('Stripe API version', () => {
  it('is the version the installed SDK is typed against', () => {
    // The type already refuses a version the SDK does not know, so this only
    // documents which one that is when someone reads a failure here.
    expect(STRIPE_API_VERSION).toBe('2025-08-27.basil')
  })

  /**
   * The app client is pinned; the batch scripts were not, and one of them is
   * the nightly apply-on reconcile. An SDK bump would have moved the scripts'
   * API version and left the app's, so `current_period_end` would read as null
   * inside an unattended job that then writes `paidThroughAt: null` over live
   * members. Pinning is one line, and this test is what keeps the next script
   * from skipping it.
   */
  it('is passed by every Stripe client in src/ and scripts/', () => {
    expect(clientsWithoutApiVersion()).toEqual([])
  })
})
