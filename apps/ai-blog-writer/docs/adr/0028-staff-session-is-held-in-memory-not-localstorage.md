# Staff session is held in memory, not localStorage

The ABW frontend used to persist its whole auth state — Staff JWT included — in
`localStorage['payload_auth']`. Any XSS anywhere in this app could read a
privileged Staff credential with one line, and the token survived the tab, the
window and the browser restart.

The token is no longer written to disk. It lives in a module-scoped store for
the lifetime of the page (`features/auth/auth-session-store.ts`), and a reload
restores the session from the httpOnly `payload-token` cookie Payload already
sets on `POST /api/users/login`. `GET /api/users/me` returns the user *and* the
current token, so the cookie alone is sufficient to rebuild the session.

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
never consulted, for the reason above. Its value is that dropping the header
later is a one-line change rather than an eight-file one.

## What this does and does not achieve

It removes the credential *at rest*. A generic XSS payload can no longer read a
Staff token out of a well-known storage key, and a token cannot outlive the
page.

It does not yet make the token unreadable by JavaScript. The FastAPI backend
identifies callers from an `Authorization: Bearer` header
(`apps/backend/app/core/staff_auth.py`), and the image routes forward that same
JWT to Payload to create media as the acting Staff user
(`apps/backend/app/features/images/payload_client.py`). While that is the
contract, the frontend has to hold a token in memory to send it.

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
- `payload-token` lives 2 hours while `SESSION_DURATION_FALLBACK_MS` assumes 7
  days. The fallback only applies when the response carries no usable expiry;
  `/api/users/me` returns `exp`, and the JWT is still decodable in memory, so
  the honest expiry is still available.

## Not done here

Making the token unreadable by JavaScript entirely requires FastAPI to accept
the `payload-token` cookie as caller identity — including for the delegated
writes to Payload, where the cookie value *is* the JWT the backend needs. That
change depends on a production origin decision this repo has not made:
`VITE_PAYLOAD_API_URL` is configured nowhere, Payload's `Users.auth` sets no
`cookies` block (so `SameSite=Lax`, `Secure=false`, host-only `Domain`), and a
cross-site or cross-host deployment would need `sameSite: 'None'`,
`secure: true` and an explicit `domain`. Accepting a cookie on the backend also
introduces a CSRF surface that must be closed deliberately rather than by
relying on the public `X-API-Key` header forcing a preflight.

Deferred until the deployment topology is settled.
