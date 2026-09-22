import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `next build` and `next start` load `.env*` files themselves, and fill in
 * every variable the parent did not set. A harness that builds its
 * environment "from scratch" is therefore only as isolated as the list of
 * names it remembered to set: on 2026-09-22 the server's `.env` carried
 * `SENTRY_DSN`, `ENDORSELY_API_KEY` and Bunny storage names the harness did
 * not mention, and the client's `.env.production.local` carried a Google Maps
 * browser key and the image CDN origin — which a production build would have
 * inlined into the JavaScript the readiness browser runs (surge plan L00).
 *
 * `neutraliseDotenv` reads every name those files define (names only; values
 * are never read into memory beyond the parse) and sets each one the harness
 * did not set explicitly to the empty string. Next does not override a
 * variable that is already defined, empty or not, so the file loses. The
 * names are returned for the run manifest.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const DENY_OUTBOUND_PRELOAD = resolve(HERE, 'deny-outbound.cjs')

const FILES = ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']

export function dotenvNames(dir: string): string[] {
  const names = new Set<string>()
  for (const file of FILES) {
    const path = resolve(dir, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
      if (match) names.add(match[1]!)
    }
  }
  return [...names].sort()
}

export function neutraliseDotenv(
  env: NodeJS.ProcessEnv,
  dir: string,
): { env: NodeJS.ProcessEnv; neutralised: string[] } {
  const neutralised: string[] = []
  const result: NodeJS.ProcessEnv = { ...env }
  for (const name of dotenvNames(dir)) {
    if (result[name] === undefined) {
      result[name] = ''
      neutralised.push(name)
    }
  }
  return { env: result, neutralised }
}

/** `NODE_OPTIONS` that loads the loopback-only guard, preserving what was there. */
export function withOutboundGuard(env: NodeJS.ProcessEnv, logPath?: string, allowHosts: string[] = []): NodeJS.ProcessEnv {
  const options = [env.NODE_OPTIONS ?? '', `--require ${DENY_OUTBOUND_PRELOAD}`].filter(Boolean).join(' ')
  return {
    ...env,
    NODE_OPTIONS: options,
    ...(logPath ? { READINESS_OUTBOUND_LOG: logPath } : {}),
    ...(allowHosts.length ? { READINESS_OUTBOUND_ALLOW: allowHosts.join(',') } : {}),
  }
}
