# Procedure: set up Sentry error reporting

**Who this is for:** the owner (creates the account) and whoever provisions
Railway at go-live.

**Why it matters:** without it, an error at 2 a.m. sits in a log until someone
happens to look. With it, Sentry emails (or texts, with the app) the moment
something breaks, with the line of code. Decision D1 in the launch fix plan.

Written 2026-09-24 (launch fix plan, item 3). The code is merged and off: it
does nothing until `SENTRY_DSN` is set. No real Sentry project exists yet, and
no agent has sent an event to one.

---

## How it fits together

```
browser error boundary ─┐
                        ├─ POST /api/client-errors ─┐
Worker onRequestError ──┘   (redacted, rate-limited) │
                                                     ├─ one log line (Railway)
API onRequestError ──────────────────────────────────┤
                                                     └─ one Sentry event (if SENTRY_DSN)
Worker onRequestError ── one JSON line ─ Workers Logs (Cloudflare)
```

- **The API** (`apps/server`, Next 16 on Railway) runs `@sentry/nextjs`
  (pinned, 10.75.3). `src/instrumentation.ts` starts it only when
  `SENTRY_DSN` is set and exports `onRequestError`, which writes one redacted
  log line and sends one event, both tagged with the request id.
- **The website** (`apps/client`, a Cloudflare Worker built by OpenNext) does
  **not** run a Sentry SDK. Sentry documents support for OpenNext on Workers,
  but it has broken production Workers before (an AsyncLocalStorage error in
  `onRequestError`, getsentry/sentry-javascript#18842; a module-resolution
  failure closed unreproduced, #18843) and adds weight to a size-capped
  Worker. The plan's amendment says: in that case, Sentry for the API and a
  beacon for the Worker. So the website's error boundaries and its own
  `onRequestError` post a small redacted report to `POST /api/client-errors`,
  and the API forwards it to Sentry tagged `service: questura-client`. One
  Sentry project covers both apps.
- **Request ids.** The API accepts a well-formed `x-request-id` or makes one,
  and returns it on every response. Every log line written during that request
  carries it. On the website the id is `x-request-id` if sent, else
  Cloudflare's `cf-ray` (returned on every response).

## What never leaves

`sendDefaultPii` is off. Before any event is sent, `scrubEvent`
(`apps/server/src/shared/observability/error-reporting.ts`) removes cookies,
request bodies, query strings, the user (except an opaque id), every header
except `user-agent`, `content-type`, `accept`, `referer` and `x-request-id`,
and local variables; then every remaining string goes through the same
redaction as the logs (`redact.ts`): email addresses, bearer tokens, Stripe
keys and signatures, Resend keys, session cookies, credentials in URLs. The
scrubber has its own unit tests. The website's reports go through the same
shapes before they leave the browser, and the browser sends them without
cookies.

## Environment variables

| Where | Variable | Value |
| --- | --- | --- |
| Railway (API) | `SENTRY_DSN` | The project's DSN. **Required** by `env:check`; the server itself boots without it. |
| Railway (API) | `SENTRY_ENVIRONMENT` | Optional. Defaults to `production` when `NODE_ENV=production`. |
| Railway (API) | `QUESTURA_RELEASE_SHA` | Already in the template. Becomes the Sentry release. |
| Worker build (client) | `NEXT_PUBLIC_QUESTURA_RELEASE_SHA` | Optional. Tags the website's reports with its release. Build-time, not a Worker secret. |
| Worker | *(none)* | The website has no DSN. Its reports go through the API. |

Development, the readiness sandbox and CI set none of these, so nothing is
loaded and nothing is sent.

## Steps

1. **Account.** Sign up at sentry.io on the free Developer plan. One user is
   enough. Turn on two-factor authentication.
2. **Project.** Create one project, platform *Next.js*, named
   `questura-server`. Skip the wizard's install step: the code is already in
   the repo. Copy the DSN (Settings → Projects → questura-server → Client Keys).
3. **Data scrubbing on Sentry's side too.** Settings → Security & Privacy:
   leave *Data Scrubber* and *Use Default Scrubbers* on, turn *Store Native
   Crash Reports* off, and add `email`, `cookie`, `authorization`,
   `stripe-signature` to *Additional Sensitive Fields*. This is a second net;
   the app already scrubs.
4. **Prove it from the laptop**, before the DSN goes anywhere else:

   ```bash
   SENTRY_DSN='<the DSN>' SENTRY_ENVIRONMENT=local-proof \
     pnpm --dir apps/questura/apps/server sentry:test-event
   ```

   Expect `Sent test event <id> to environment "local-proof".` Then in Sentry,
   Issues → the new "Questura Sentry test event" issue: the title, the
   `scrub_check` extra and the source lines must read `[email]` and
   `[redacted]`, never `reader@example.com`, a cookie value or a key. If any
   original shows, stop: the scrubber is broken and the DSN must not go on
   Railway. Resolve the issue afterwards.

   Without `SENTRY_DSN` the command refuses and sends nothing.
5. **Railway.** Set `SENTRY_DSN` on the API service (and `SENTRY_ENVIRONMENT`
   if you want something other than `production`). `env:check` refuses a
   filled template without it.
6. **Alerts.** Create the rules in the checklist on issue #690 ("Alerts"
   comment). The one that matters most on day one: *a new issue is created →
   email (and push, with the Sentry app)*.
7. **At the quiet go-live** (plan PL4): force one API error and one website
   error and confirm each arrives as one event with a request id, and the
   alert reaches your phone.

## Later, not now

- **Source maps.** Server stack traces point at the built files, which are
  readable but not the original TypeScript lines. Uploading source maps needs
  `withSentryConfig` in the build and a `SENTRY_AUTH_TOKEN` at build time: a
  build change worth doing once the build pipeline on the real platform exists.
- **Tracing.** Off on purpose (no `tracesSampleRate`). It is a separate
  decision with its own quota.
- **Sentry in the Worker.** Revisit if Sentry's OpenNext support settles and
  the Worker has size headroom; the beacon keeps working either way.
