/**
 * The sandbox's stand-in for Cloudflare in front of the API (ADR-0016,
 * launch fix plan item 10).
 *
 *   node --import tsx scripts/readiness/front-door-edge.ts <listen port> <origin port>
 *   (the secret arrives as READINESS_EDGE_ORIGIN_SECRET, never on argv)
 *
 * On the platform, every request to the API host passes Cloudflare, and a
 * Transform Rule sets `X-Questura-Origin-Auth: <secret>` on it. The backend
 * refuses requests without it. The stack runs the backend on its own port
 * (the "Railway edge": reachable, but locked) and this process on the API's
 * public port, so every harness, browser and fake provider that calls the API
 * goes through the front door, exactly as readers, Stripe and Google will.
 *
 * One deliberate pessimism: a request carrying `x-questura-render-token` is
 * the site's own server-side render, and it is forwarded **without** the
 * header added. Whether a Transform Rule applies to a Worker's subrequests is
 * a platform unknown (plan PL1); the sandbox assumes it does not, so the
 * client has to send the header itself or its pages fail to render.
 *
 * What it does not emulate by default: overwriting `CF-Connecting-IP`. The
 * harnesses set that header to stand for many readers, and the trusted-proxy
 * rules are proven elsewhere. `POST /__edge/client-address` with
 * `{ "overwrite": true }` turns it on: every forwarded request then carries
 * the caller's real socket address, as Cloudflare does, which makes a whole
 * load test one caller (launch fix plan item 9). That is the problem the load
 * identity (`src/shared/http/load-identity.ts`) exists for, reproduced here
 * so its fix can be shown. `{ "overwrite": false }` turns it off again.
 *
 * `GET /__edge/stats` is answered here and never forwarded: how many render
 * subrequests arrived with and without their own header, and how many answers
 * were 403 (for renders that can only be the lock; for everything else it
 * includes the app's own refusals). The front-door check reads it to prove
 * renders really reached the API with the key.
 *
 * `POST /__edge/fault` with `{ "status": 503, "match": "<text>" }` makes the
 * edge answer that status itself, without forwarding, for every request whose
 * path and query contain `match`; a body of `null` clears it. The browser
 * journeys use it to show what a reader sees when the API is down for one
 * article (launch fix plan item 8). One fault at a time, never on by default.
 */

import { Agent, createServer, request as httpRequest } from 'node:http'

const ORIGIN_HEADER = 'x-questura-origin-auth'
const RENDER_HEADER = 'x-questura-render-token'
export const EDGE_STATS_PATH = '/__edge/stats'
/** Marks a request from the front-door check itself: forwarded, never counted. */
export const PROBE_HEADER = 'x-readiness-edge-probe'
export const EDGE_FAULT_PATH = '/__edge/fault'
export const EDGE_CLIENT_ADDRESS_PATH = '/__edge/client-address'
const CLIENT_ADDRESS_HEADER = 'cf-connecting-ip'

/** Parses a client-address request body: `{ "overwrite": boolean }`. */
export function parseClientAddressMode(body: string): boolean | 'invalid' {
  try {
    const parsed = JSON.parse(body || 'null') as { overwrite?: unknown } | null
    return parsed && typeof parsed.overwrite === 'boolean' ? parsed.overwrite : 'invalid'
  } catch {
    return 'invalid'
  }
}

/** What Cloudflare would write: the peer's address, an IPv4-mapped IPv6 one unwrapped. */
export function peerAddress(remote: string | undefined): string {
  return (remote ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '') || '0.0.0.0'
}

export type EdgeFault = { status: number; match: string } | null

/** Parses a fault request body. Only 5xx statuses and a non-empty match are accepted. */
export function parseEdgeFault(body: string): EdgeFault | 'invalid' {
  let parsed: unknown
  try {
    parsed = JSON.parse(body || 'null')
  } catch {
    return 'invalid'
  }
  if (parsed === null) return null
  const { status, match } = parsed as { status?: unknown; match?: unknown }
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 500 || status > 599) return 'invalid'
  if (typeof match !== 'string' || match.length === 0) return 'invalid'
  return { status, match }
}

export type EdgeStats = {
  forwarded: number
  renders: { withKey: number; withoutKey: number }
  answered403: { renders: number; others: number }
  /** Requests whose `CF-Connecting-IP` was overwritten with the peer's address. */
  clientAddressOverwritten: number
}

function main(): void {
  const [listenPort, originPort] = process.argv.slice(2).map(Number)
  const secret = process.env.READINESS_EDGE_ORIGIN_SECRET ?? ''
  if (!listenPort || !originPort || secret.length < 32) {
    console.error('usage: front-door-edge.ts <listen port> <origin port>, with READINESS_EDGE_ORIGIN_SECRET (32+ chars) set')
    process.exit(2)
  }

  const agent = new Agent({ keepAlive: true, maxSockets: 256 })
  const stats: EdgeStats = { forwarded: 0, renders: { withKey: 0, withoutKey: 0 }, answered403: { renders: 0, others: 0 }, clientAddressOverwritten: 0 }
  let fault: EdgeFault = null
  let overwriteClientAddress = false

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === EDGE_STATS_PATH) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(stats))
      return
    }

    if (req.method === 'POST' && req.url === EDGE_FAULT_PATH) {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const next = parseEdgeFault(body)
        if (next === 'invalid') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'expected null or { status: 5xx, match: "<text>" }' }))
          return
        }
        fault = next
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ fault }))
      })
      return
    }

    if (req.method === 'POST' && req.url === EDGE_CLIENT_ADDRESS_PATH) {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const next = parseClientAddressMode(body)
        if (next === 'invalid') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'expected { "overwrite": true | false }' }))
          return
        }
        overwriteClientAddress = next
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ overwrite: overwriteClientAddress }))
      })
      return
    }

    if (fault && req.url?.includes(fault.match)) {
      res.writeHead(fault.status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: 'Service unavailable (sandbox edge fault)' }))
      req.resume()
      return
    }

    const headers = { ...req.headers }
    // The front-door check's own deliberate misses are not the site's renders.
    const probe = headers[PROBE_HEADER] !== undefined
    delete headers[PROBE_HEADER]
    const render = typeof headers[RENDER_HEADER] === 'string'
    if (render) {
      if (probe) {
        // not counted
      } else if (headers[ORIGIN_HEADER]) stats.renders.withKey += 1
      else stats.renders.withoutKey += 1
    } else {
      // The Transform Rule sets the header, replacing whatever the caller sent.
      headers[ORIGIN_HEADER] = secret
    }
    if (overwriteClientAddress) {
      headers[CLIENT_ADDRESS_HEADER] = peerAddress(req.socket.remoteAddress)
      stats.clientAddressOverwritten += 1
    }
    stats.forwarded += 1

    const upstream = httpRequest(
      { host: '127.0.0.1', port: originPort, method: req.method, path: req.url, headers, agent },
      (response) => {
        if (response.statusCode === 403 && !probe) {
          if (render) stats.answered403.renders += 1
          else stats.answered403.others += 1
        }
        res.writeHead(response.statusCode ?? 502, response.rawHeaders)
        response.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end('edge: origin unreachable')
    })
    req.pipe(upstream)
  })

  // Fault checks hold a request open while Postgres is frozen (~17 s); the
  // edge must outwait the backend, never answer for it.
  server.requestTimeout = 0
  server.headersTimeout = 120_000
  server.keepAliveTimeout = 65_000
  server.listen(listenPort, '127.0.0.1', () => {
    console.log(`front-door edge on 127.0.0.1:${listenPort} → 127.0.0.1:${originPort}`)
  })
}

if (process.argv[1]?.endsWith('front-door-edge.ts')) main()
