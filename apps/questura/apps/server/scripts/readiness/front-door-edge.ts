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
 * What it does not emulate: overwriting `CF-Connecting-IP`. The harnesses set
 * that header to stand for many readers, and the trusted-proxy rules are
 * proven elsewhere.
 *
 * `GET /__edge/stats` is answered here and never forwarded: how many render
 * subrequests arrived with and without their own header, and how many answers
 * were 403 (for renders that can only be the lock; for everything else it
 * includes the app's own refusals). The front-door check reads it to prove
 * renders really reached the API with the key.
 */

import { Agent, createServer, request as httpRequest } from 'node:http'

const ORIGIN_HEADER = 'x-questura-origin-auth'
const RENDER_HEADER = 'x-questura-render-token'
export const EDGE_STATS_PATH = '/__edge/stats'
/** Marks a request from the front-door check itself: forwarded, never counted. */
export const PROBE_HEADER = 'x-readiness-edge-probe'

export type EdgeStats = {
  forwarded: number
  renders: { withKey: number; withoutKey: number }
  answered403: { renders: number; others: number }
}

function main(): void {
  const [listenPort, originPort] = process.argv.slice(2).map(Number)
  const secret = process.env.READINESS_EDGE_ORIGIN_SECRET ?? ''
  if (!listenPort || !originPort || secret.length < 32) {
    console.error('usage: front-door-edge.ts <listen port> <origin port>, with READINESS_EDGE_ORIGIN_SECRET (32+ chars) set')
    process.exit(2)
  }

  const agent = new Agent({ keepAlive: true, maxSockets: 256 })
  const stats: EdgeStats = { forwarded: 0, renders: { withKey: 0, withoutKey: 0 }, answered403: { renders: 0, others: 0 } }

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === EDGE_STATS_PATH) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(stats))
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
