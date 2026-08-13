# Staff session is held in memory, not localStorage

The ABW frontend used to persist its whole auth state — Staff JWT included — in
`localStorage['payload_auth']`. Any XSS anywhere in this app could read a
privileged Staff credential with one line, and the token survived the tab, the
window and the browser restart.

The token is no longer written to disk. It lives in a module-scoped store for
the lifetime of the page (`features/auth/auth-session-store.ts`), and a reload
restores the session from the httpOnly `payload-token` cookie Payload already
sets on `POST /api/users/login`. `GET /api/users/me` returns the user and an
`exp`, so the cookie alone is sufficient to rebuild the session.

Bootstrap deletes anything an earlier build left under the old key, because the
code that would have cleared it on logout is the code being removed.

Logout sends no `Authorization` header. Payload clears the cookie only on a
2xx, and `extractJWT` uses the *first* token it finds — an already-expired
Bearer is extracted, fails to verify, and leaves the cookie alive. Since the
cookie is now the only thing that restores a session, that would sign the
operator back in on the next load. The cookie is what has to be cleared, so the
cookie is what identifies the request.

Every authenticated Payload client sends `credentials: 'include'`. They
previously disagreed — some `'include'`, some `'omit'`, some unset (meaning
`'same-origin'`, and Payload is never same-origin with this app). That is
consistency, **not** a fallback: while a Bearer header is present the cookie is
never consulted, for the reason above. Its value was that dropping the header
later became a small change rather than an eight-file one — which is what
happened next.

## What this does and does not achieve

It removed the credential *at rest*: a generic XSS payload could no longer read
a Staff token out of a well-known storage key, and a token could not outlive the
page. It did not remove it from memory — the section below records how that was
finished.

## Consequences

- Cookie *authentication* is gated by Payload's `csrf` list, not its `cors`
  list: `extractJWT` discards the cookie when `Origin` is absent from
  `payload.config.csrf`. Those happen to be the same list here — `payload.config.ts`
  feeds both from `APP_CONFIG.CORS_ORIGINS` — so an origin allowlisted for CORS
  is also trusted for the cookie. If they are ever split, this breaks silently
  as a 401.
- Every page load now costs one `/api/users/me` round trip before protected
  routes render, up to 8s before the fallback request. `RequireAuth` already
  waited on `isRestoringSession`, but it rendered `null`: a path only logged-out
  visitors reached before is now the normal reload path, so it shows the same
  "Restoring session" card `LoginPage` uses instead of a blank screen.
- If Payload is unreachable at load, the operator is treated as logged out
  rather than resuming on a stale stored token. That is the correct reading of
  "we cannot confirm this session".
- `payload-token` lived 2 hours while `SESSION_DURATION_FALLBACK_MS` assumed 7
  days. That mismatch is resolved below: the constant is gone and an unknown
  expiry now means "no session".

## Finished: the token is gone from JavaScript

Settled 2026-08-12 and completed in PRs #222-227. The deployment topology that
had blocked this is: every service is a sibling subdomain of one registrable
domain — `www` and `cms` deployed, `abw` and `abw-api` behind a Cloudflare
Tunnel. Siblings of one registrable domain are *same-site*, so `SameSite=Lax`
holds and no third-party cookie is involved; only the cookie's `Domain` had to
widen. Cross-site hosting was rejected because it forces `SameSite=None`, which
Safari and Brave block outright.

What that unlocked, in order:

1. `Users.auth.cookies` scopes `payload-token` to the registrable domain, with
   `PAYLOAD_COOKIE_DOMAIN` a hard production boot requirement (`host-only` is
   the explicit opt-out).
2. FastAPI reads the cookie as caller identity. The CSRF surface that opens is
   closed with an `Origin` check against the pinned CORS allowlist — **not**
   with `X-API-Key`, which is Vite-inlined and public. A wildcard allowlist
   refuses cookie auth outright.
3. Every client — `apiFetch`, the Payload clients, and the image clients —
   sends `credentials: 'include'` and no `Authorization` header.
4. `AuthState` carries no token. Session expiry comes from the `exp` that
   `loginOperation`, `refreshOperation` and `meOperation` all return, so
   nothing needs to decode a JWT.

The delegated writes still work unchanged: the cookie's value *is* the JWT the
backend forwards to Payload, so uploads are still created as the acting Staff
user rather than a service account.

### Consequences worth knowing

- **Never send a Bearer header alongside the cookie.** `extractJWT` returns the
  *first* credential in `jwtOrder` (JWT, Bearer, cookie) and verifies only that
  one, so a stale header shadows a valid cookie and fails the request. This bit
  `logoutPayloadUser` before, and `requestSession` latently: it attached the
  in-memory token whenever one existed, so a token expiring slightly before its
  cookie turned a renewable session into a forced logout.
- **An unknown expiry now means "no session"**, rather than the invented 7 days
  the old fallback used. That also removes the 2h-cookie-vs-7d-fallback
  mismatch this ADR previously flagged.
- **The `!token` guards were dead, not translated.** Every component holding
  one renders only inside `RequireAuth`, which returns `<Navigate>` when
  `!isAuthenticated` — and `isAuthenticated` used to require a truthy token. All
  74 were unreachable and were deleted.
- **The permissions access cache is keyed by Staff id**, not by token. It used
  to re-fetch on every renewal because renewal minted a new key. It is now
  cleared on logout, which it never was.
- `payload_jwt` on `POST /itineraries-pipeline/generate` was a **required** body
  field. It is now optional and cookie-sourced, with a body value still winning
  so non-browser callers keep working. Any future route taking a JWT in its body
  has the same latent break.

### What this does and does not achieve

An XSS payload can no longer read a Staff credential — there is nothing to
read, at rest or in memory. It can still *act* as the operator while the page is
open, because the browser attaches the cookie to any request it makes. The gain
is that a credential cannot be extracted and replayed elsewhere, later.
