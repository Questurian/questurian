/**
 * What the built server actually sends, against what both apps' types say
 * (launch harness D3).
 *
 *   pnpm readiness:stack -- up --build
 *   pnpm readiness:contracts            # compare with apps/questura/contracts
 *   pnpm readiness:contracts -- --update
 *
 * Each response is reduced to its shape (keys and value types, placeholder
 * values, so no email or id is committed) and compared with the committed
 * sample in `apps/questura/contracts/`. Those samples are what the client
 * and the server type-check against (`apiContract.typecheck.ts` in each), so
 * a field one side has and the other lacks fails a typecheck, and a field the
 * built server sends that nobody declared fails here. The `graceUntil` drift
 * (sent and read, never declared by the server) would have been caught by
 * both.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { signIn } from './identities'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { readStackState, STACK_PORTS } from './stack'

const HERE = dirname(fileURLToPath(import.meta.url))
const CONTRACTS = resolve(HERE, '../../../../contracts')
const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`

/** Same keys, same value types, placeholder values. */
export function shapeOf(value: unknown): unknown {
  if (value === null) return null
  if (Array.isArray(value)) return value.length === 0 ? [] : [shapeOf(value[0])]
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, shapeOf((value as Record<string, unknown>)[key])]),
    )
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return true
  return String(typeof value)
}

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up --build')
  const origin = stack.origins.client
  const cookie = await signIn(BACKEND, origin, 'member-a@example.com', '198.22.0.1')
  const get = async (path: string, withCookie: boolean) =>
    (await fetch(`${BACKEND}${path}`, { headers: { origin, 'cf-connecting-ip': '198.22.0.2', ...(withCookie ? { cookie } : {}) } })).json()

  const samples: Record<string, unknown> = {
    'api-me.signed-in': shapeOf(await get('/api/me', true)),
    'api-me.signed-out': shapeOf(await get('/api/me', false)),
    'api-account-auth-methods': shapeOf(await get('/api/account/auth-methods', true)),
    'api-payments-plans': shapeOf(await get('/api/payments/plans', false)),
  }

  const update = process.argv.includes('--update')
  let drifted = 0
  for (const [name, shape] of Object.entries(samples)) {
    const path = resolve(CONTRACTS, `${name}.json`)
    const next = `${JSON.stringify(shape, null, 2)}\n`
    let current = ''
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      // first run
    }
    if (update) {
      writeFileSync(path, next)
      console.log(`  wrote ${name}.json`)
    } else if (current !== next) {
      drifted += 1
      console.log(` FAIL  ${name}: the built server's response shape differs from contracts/${name}.json`)
      console.log(next)
    } else {
      console.log(`  ok    ${name}`)
    }
  }
  if (drifted > 0) {
    console.log('\nIf the change is intended: pnpm readiness:contracts -- --update, then fix both apps\' types until they typecheck.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(2)
})
