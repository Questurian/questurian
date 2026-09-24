/**
 * Run by `client-identity.production.test.ts` in a child process with
 * `NODE_ENV=production`. Better Auth reads `NODE_ENV` once, when it loads, and
 * only in production does an unreadable address reach its fallback (limiter
 * off up to 1.6.11, one shared bucket by 1.6.33) — so this cannot run inside
 * vitest, where it is always `test`.
 *
 * Two real Better Auth instances, memory adapter, identical except for how
 * they learn the caller's address. Each gets `ATTEMPTS` failed sign-ins from
 * a caller who sends no proxy header, against a limit of `LIMIT`. Prints the
 * statuses as JSON on the last line of stdout.
 */
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { VISITOR_AUTH_CLIENT_IP_HEADER, withClientIdentity } from './client-identity'

const LIMIT = 3
const ATTEMPTS = LIMIT + 3
const BASE_URL = 'https://api.example.test'

function instance(ipAddressHeaders: string[]) {
  return betterAuth({
    baseURL: BASE_URL,
    basePath: '/api/visitor-auth',
    secret: 'fixture-secret-fixture-secret-fixture-secret-0123456789',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    trustedOrigins: [BASE_URL],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'memory',
      customRules: { '/sign-in/email': { window: 60, max: LIMIT } },
    },
    advanced: { ipAddress: { ipAddressHeaders, disableIpTracking: false } },
    logger: { disabled: true },
  })
}

function signIn(headers: Record<string, string>): Request {
  return new Request(`${BASE_URL}/api/visitor-auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL, ...headers },
    body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-1' }),
  })
}

async function statuses(
  auth: ReturnType<typeof instance>,
  prepare: (request: Request) => Request,
  headers: Record<string, string>,
): Promise<number[]> {
  const seen: number[] = []
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    seen.push((await auth.handler(prepare(signIn(headers)))).status)
  }
  return seen
}

async function main() {
  const direct = instance(['cf-connecting-ip'])
  const routed = instance([VISITOR_AUTH_CLIENT_IP_HEADER])
  const asIs = (request: Request) => request

  const result = {
    nodeEnv: process.env.NODE_ENV,
    limit: LIMIT,
    // How the app was configured before: Better Auth reads the proxy header.
    proxyHeaderMissing: await statuses(direct, asIs, {}),
    proxyHeaderJunk: await statuses(direct, asIs, { 'cf-connecting-ip': 'junk' }),
    // How it is configured now: the route writes the identity header.
    routedMissing: await statuses(routed, withClientIdentity, {}),
    routedJunk: await statuses(routed, withClientIdentity, { 'cf-connecting-ip': 'junk' }),
    routedForged: await statuses(routed, withClientIdentity, {
      [VISITOR_AUTH_CLIENT_IP_HEADER]: '203.0.113.9',
    }),
  }

  console.log(JSON.stringify(result))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
