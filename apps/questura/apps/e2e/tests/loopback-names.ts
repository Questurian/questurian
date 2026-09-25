/**
 * `*.localhost` names answer on loopback (RFC 6761 §6.3). Browsers treat them
 * that way; Node asks the OS resolver, and macOS's does not, so on a Mac
 * `fetch('http://app.readiness.localhost:3100')` fails with ENOTFOUND while
 * Chrome loads the same page.
 *
 * `playwright.config.ts` installs this for sandbox runs, so the tests' own
 * requests (`page.request`, `route.fetch`, fetch) reach the sandbox the way
 * the browsers do. `net.connect` reads `dns.lookup` at call time; Playwright's
 * own requests read `dns.promises.lookup`. Both are covered. Every other name
 * still goes to the OS resolver untouched. A copy of
 * `server/scripts/launch-verify/loopback-names.ts`: this package imports
 * nothing from the server.
 */
import dns from 'node:dns'

export function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'localhost' || host.endsWith('.localhost')
}

let installed = false

export function resolveLocalhostNamesToLoopback(): void {
  if (installed) return
  installed = true
  const osLookup = dns.lookup
  const lookup = ((hostname: string, options: unknown, callback?: unknown) => {
    const done = (typeof options === 'function' ? options : callback) as (...args: unknown[]) => void
    const opts = (typeof options === 'object' && options !== null ? options : {}) as dns.LookupOptions
    if (!isLocalhostName(hostname) || opts.family === 6) {
      return (osLookup as (...args: unknown[]) => void)(hostname, options, callback)
    }
    const address = { address: '127.0.0.1', family: 4 }
    process.nextTick(() => (opts.all ? done(null, [address]) : done(null, address.address, address.family)))
  }) as typeof dns.lookup
  dns.lookup = lookup

  const osPromisesLookup = dns.promises.lookup
  dns.promises.lookup = (async (hostname: string, options?: dns.LookupOptions | number) => {
    const opts = typeof options === 'object' && options !== null ? options : {}
    if (!isLocalhostName(hostname) || opts.family === 6) return osPromisesLookup(hostname, options as dns.LookupOptions)
    const address = { address: '127.0.0.1', family: 4 }
    return opts.all ? [address] : address
  }) as typeof dns.promises.lookup
}
