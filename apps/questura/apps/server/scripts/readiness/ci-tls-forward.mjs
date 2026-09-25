#!/usr/bin/env node
/**
 * CI only (.github/workflows/questura-safety-net.yml): a loopback HTTPS front
 * for the readiness stack, so the client can be built the way H01 step 19
 * builds it (https addresses, production guard on) while pre-rendering from
 * the sandbox API instead of anything real.
 *
 *   api.questura-ci.invalid  → the stack's API front door (127.0.0.1:4100)
 *   www.questura-ci.invalid  → the stack's client (127.0.0.1:3100)
 *
 * The workflow maps both names to 127.0.0.1 in /etc/hosts. `.invalid` never
 * resolves anywhere real, so a missing mapping fails the build instead of
 * reaching a live host. Listens on 127.0.0.1:443 only; the certificate is a
 * throwaway the workflow makes and hands the build as NODE_EXTRA_CA_CERTS.
 * No dependencies.
 */
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:https'

const UPSTREAMS = {
  'api.questura-ci.invalid': 4100,
  'www.questura-ci.invalid': 3100,
}

const cert = process.env.CI_TLS_CERT
const key = process.env.CI_TLS_KEY
if (!cert || !key) {
  console.error('CI_TLS_CERT and CI_TLS_KEY must name the certificate and key files.')
  process.exit(2)
}

const server = createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  const host = (req.headers.host ?? '').split(':')[0].toLowerCase()
  const port = UPSTREAMS[host]
  if (!port) {
    res.writeHead(421).end(`not served here: ${host}\n`)
    return
  }
  const upstream = request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  upstream.on('error', (error) => {
    console.error(`${req.method} ${host}${req.url}: ${error.message}`)
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(upstream)
  console.log(`${req.method} ${host}${req.url}`)
})

server.listen(443, '127.0.0.1', () => console.log('ci-tls-forward listening on 127.0.0.1:443'))
