import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

/**
 * A Google that only the sandbox can reach, plus a mailbox (launch harness B4).
 *
 * Better Auth's Google provider has its endpoints written into it
 * (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`), and
 * the production config offers no way to point them elsewhere. Rather than
 * add one — a switch in production code that sends Google sign-in somewhere
 * else is exactly the backdoor this harness exists to rule out — the sandbox
 * backend loads `oauth-fake-route.cjs`, which re-aims the backend's own
 * `fetch` at this server for those hosts only. The authorize step happens in
 * the browser, so the harness (playing the browser) visits this server
 * instead of accounts.google.com with the same query string.
 *
 * What it models, and checks as strictly as Google would:
 *
 *  - `GET  /o/oauth2/v2/auth` — the consent screen. The harness says who is
 *    signed in to "Google" with `readiness_as` (base64url JSON: sub, email,
 *    email_verified, name). Refuses an unknown client, an unregistered
 *    redirect URI, a missing state, and anything but PKCE S256.
 *  - `POST /google/token` — the code exchange. Client id and secret, the exact
 *    redirect URI, the PKCE verifier; a code works once, for ten minutes.
 *    Answers an RS256 id_token Google-shaped enough for Better Auth.
 *  - `GET  /google/certs`, `/google/userinfo`, `/.well-known/openid-configuration`.
 *  - `POST /resend/emails` — Resend's send endpoint, so reset and
 *    verification links can be read back (`GET /__control/mail?to=`).
 *  - `POST /__control/id-token` — mints an id_token with chosen claims, for
 *    the id-token sign-in path.
 *  - `GET  /__control/stats` — how many exchanges it answered and refused.
 *
 * Nothing here talks to Google or Resend. Loopback only.
 */

export const FAKE_GOOGLE = {
  clientId: 'readiness-google-client.apps.googleusercontent.test',
  clientSecret: 'readiness-google-secret-not-a-real-one',
  issuer: 'https://accounts.google.com',
} as const

export type FakeGoogleIdentity = { sub: string; email: string; email_verified: boolean; name?: string }
export type FakeMail = { at: string; to: string[]; subject: string; links: string[] }
export type FakeStats = { exchanged: number; refused: Record<string, number> }

type Grant = {
  identity: FakeGoogleIdentity
  redirectUri: string
  challenge: string
  nonce: string | null
  expiresAt: number
  used: boolean
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

export function signJwt(claims: Record<string, unknown>, key: KeyObject, header: Record<string, unknown>): string {
  const head = base64url(JSON.stringify({ typ: 'JWT', ...header }))
  const body = base64url(JSON.stringify(claims))
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), key)
  return `${head}.${body}.${base64url(signature)}`
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

export function startFakeProvider(port: number, options: { redirectUri: string }): Promise<Server> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const kid = `readiness-${randomBytes(6).toString('hex')}`
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid, alg: 'RS256', use: 'sig' }

  const grants = new Map<string, Grant>()
  const accessTokens = new Map<string, FakeGoogleIdentity>()
  const mail: FakeMail[] = []
  const stats: FakeStats = { exchanged: 0, refused: {} }
  const refuse = (res: ServerResponse, reason: string, status = 400, error = 'invalid_grant') => {
    stats.refused[reason] = (stats.refused[reason] ?? 0) + 1
    send(res, status, { error, error_description: reason })
  }

  const idToken = (identity: FakeGoogleIdentity, nonce: string | null, overrides: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000)
    return signJwt(
      {
        iss: FAKE_GOOGLE.issuer,
        aud: FAKE_GOOGLE.clientId,
        azp: FAKE_GOOGLE.clientId,
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.email_verified,
        name: identity.name ?? 'Readiness Google',
        iat: now,
        exp: now + 3600,
        ...(nonce ? { nonce } : {}),
        ...overrides,
      },
      privateKey,
      { alg: 'RS256', kid },
    )
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
        const q = url.searchParams
        if (q.get('client_id') !== FAKE_GOOGLE.clientId) return refuse(res, 'unknown client', 400, 'invalid_client')
        if (q.get('redirect_uri') !== options.redirectUri) return refuse(res, 'redirect_uri_mismatch', 400, 'redirect_uri_mismatch')
        if (q.get('response_type') !== 'code') return refuse(res, 'response_type', 400, 'unsupported_response_type')
        if (!q.get('state')) return refuse(res, 'no state', 400, 'invalid_request')
        if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return refuse(res, 'no PKCE', 400, 'invalid_request')
        const as = q.get('readiness_as')
        if (!as) return refuse(res, 'nobody signed in to the fake Google', 400, 'login_required')
        const identity = JSON.parse(Buffer.from(as, 'base64url').toString('utf8')) as FakeGoogleIdentity
        const code = `4/${randomBytes(24).toString('base64url')}`
        grants.set(code, {
          identity,
          redirectUri: options.redirectUri,
          challenge: q.get('code_challenge')!,
          nonce: q.get('nonce'),
          expiresAt: Date.now() + 10 * 60_000,
          used: false,
        })
        const back = new URL(options.redirectUri)
        back.searchParams.set('state', q.get('state')!)
        back.searchParams.set('code', code)
        back.searchParams.set('scope', q.get('scope') ?? 'openid email profile')
        res.writeHead(302, { location: back.toString(), 'cache-control': 'no-store' })
        return res.end()
      }

      if (req.method === 'POST' && url.pathname === '/google/token') {
        const form = new URLSearchParams(await readBody(req))
        let clientId = form.get('client_id')
        let clientSecret = form.get('client_secret')
        const basic = req.headers.authorization?.match(/^Basic (.+)$/)
        if (basic) {
          const [id, secret] = Buffer.from(basic[1]!, 'base64').toString('utf8').split(':')
          clientId = decodeURIComponent(id ?? '')
          clientSecret = decodeURIComponent(secret ?? '')
        }
        if (clientId !== FAKE_GOOGLE.clientId || clientSecret !== FAKE_GOOGLE.clientSecret) {
          return refuse(res, 'client authentication', 401, 'invalid_client')
        }
        if (form.get('grant_type') !== 'authorization_code') return refuse(res, 'grant_type', 400, 'unsupported_grant_type')
        const code = form.get('code') ?? ''
        const grant = grants.get(code)
        if (!grant) return refuse(res, 'unknown code')
        if (grant.used) {
          // RFC 6749 §4.1.2: a code used twice is an attack; answer nothing.
          return refuse(res, 'code reused')
        }
        grant.used = true
        if (grant.expiresAt < Date.now()) return refuse(res, 'code expired')
        if (form.get('redirect_uri') !== grant.redirectUri) return refuse(res, 'redirect_uri mismatch')
        const verifier = form.get('code_verifier') ?? ''
        if (base64url(createHash('sha256').update(verifier).digest()) !== grant.challenge) return refuse(res, 'PKCE verifier mismatch')
        const accessToken = `ya29.${randomBytes(24).toString('base64url')}`
        accessTokens.set(accessToken, grant.identity)
        stats.exchanged += 1
        return send(res, 200, {
          access_token: accessToken,
          expires_in: 3599,
          token_type: 'Bearer',
          scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          id_token: idToken(grant.identity, grant.nonce),
        })
      }

      if (req.method === 'GET' && url.pathname === '/google/certs') return send(res, 200, { keys: [jwk] })

      if (req.method === 'GET' && url.pathname === '/google/userinfo') {
        const token = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
        const identity = accessTokens.get(token)
        if (!identity) return refuse(res, 'userinfo token', 401, 'invalid_token')
        return send(res, 200, { ...identity, name: identity.name ?? 'Readiness Google' })
      }

      if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer: FAKE_GOOGLE.issuer,
          authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_endpoint: 'https://oauth2.googleapis.com/token',
          userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
          jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        })
      }

      if (req.method === 'POST' && url.pathname === '/resend/emails') {
        const body = JSON.parse(await readBody(req)) as { to?: string | string[]; subject?: string; html?: string }
        const html = body.html ?? ''
        const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!.replaceAll('&amp;', '&'))
        mail.push({
          at: new Date().toISOString(),
          to: (Array.isArray(body.to) ? body.to : [body.to ?? '']).map((to) => to.toLowerCase()),
          subject: body.subject ?? '',
          links: [...new Set(links)],
        })
        return send(res, 200, { id: `readiness-${mail.length}` })
      }

      if (req.method === 'GET' && url.pathname === '/__control/mail') {
        const to = (url.searchParams.get('to') ?? '').toLowerCase()
        return send(res, 200, mail.filter((entry) => entry.to.includes(to)).reverse())
      }

      if (req.method === 'POST' && url.pathname === '/__control/id-token') {
        const body = JSON.parse(await readBody(req)) as { identity: FakeGoogleIdentity; claims?: Record<string, unknown> }
        return send(res, 200, { token: idToken(body.identity, null, body.claims ?? {}) })
      }

      if (req.method === 'GET' && url.pathname === '/__control/stats') return send(res, 200, stats)

      return refuse(res, `unmodelled ${req.method} ${url.pathname}`, 404, 'not_found')
    } catch (error) {
      send(res, 500, { error: 'fake_provider_error', error_description: error instanceof Error ? error.message : String(error) })
    }
  })

  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)))
}

if (process.argv[1]?.endsWith('oauth-fake.ts')) {
  const port = Number(process.argv[2] ?? 3192)
  const redirectUri = process.env.READINESS_GOOGLE_REDIRECT_URI
  if (!redirectUri) throw new Error('READINESS_GOOGLE_REDIRECT_URI is required.')
  void startFakeProvider(port, { redirectUri }).then(() => console.log(`Fake Google and mailbox on 127.0.0.1:${port}`))
}
