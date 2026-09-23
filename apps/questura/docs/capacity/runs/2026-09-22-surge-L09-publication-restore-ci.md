# Surge L09 — publication, restored service, required integrations, adapter

Local, 2026-09-22, on a freshly bootstrapped and seeded launch corpus with
production builds (stack from `pnpm readiness:stack`). JSON evidence beside
this file: `…-surge-L09-publication.json`, `…-surge-L09-restore.json`,
`…-surge-L09-adapter.json`.

## Publication — `pnpm readiness:publication`: 11/11

Edits go through Payload's REST API as the synthetic staff account. Every
observation of every affected page must be a *complete* permitted state
(recognised by disjoint markers); a mixed or unexplained page fails at once.

| Scenario | Converged |
|---|---|
| body revision R1 → R2 | 0.6 s |
| rename: article page and its city page | 0.1 s |
| rename: search (index title, asynchronous) | 0.5 s |
| free → members-only; the member text added in the same save never public | 0.1 s |
| unpublish → 404 | < 0.1 s |
| republish → 200 (no stale cached 404) | 2.6 s |
| slug change: new path serves, old path redirects | 0.1 s |
| deletion → 404 | < 0.1 s |
| client frozen (SIGSTOP) during a save: job retried, not marked done | — |
| after the client resumes, the page converges | 0.1 s |
| queue drains: nothing owed, nothing failed | — |

The checker itself is shown to fail (`harness.test.ts`): right title over the
wrong body, a half-old/half-new page, member text anywhere after gating, and a
path that never converges. Rename checks read what a reader sees (no `<head>`,
no scripts) because an article's SEO title is a separate field that keeps its
old text by design; privacy checks read the whole document.

Short convergence times reflect the local loop (a save triggers a drain within
a second); the deadline is 45 s, 90 s after a failed delivery.

## Restored service — `pnpm readiness:restore`: 35/35

- `psql -v ON_ERROR_STOP=1 --single-transaction`, exit code checked. A dump
  with one broken statement is **refused and leaves nothing behind** (the old
  procedure ran without `ON_ERROR_STOP`).
- 13 critical counts match; the obligation pending at dump time survives with
  its generation (scheduled an hour ahead so the live worker cannot deliver it
  before the dump).
- The real backend boots on the restored database (port 4102).
- Search: with the index emptied the gate **fails** — the route has a
  deliberate fallback to a corpus query, so the gate requires the answer to
  come from the index (`Server-Timing: search;desc="index"`); after
  `rebuildSearchIndex` a marker search returns exactly the expected piece.
- Owed work: the "nothing owed" gate fails before draining, passes after, and
  the planted obligation's path was delivered.
- Member A signs in with the restored password hash and is exactly member A;
  the member body and A's exact bookmarks are served.
- Relations: profiles↔accounts, bookmarks↔readers and targets, media-set
  variants↔assets, published articles↔featured images — all intact.

Restore of the launch corpus took ~1.9 s on this Mac. Not PITR, not a managed
backup, not a provider timing.

## Required integrations — `pnpm readiness:required`

Runs the readiness folder with `READINESS_REQUIRED=1`: an unreachable
disposable database throws instead of skipping, and vitest's JSON report is
read — any failed, skipped or pending test, or no integration test at all, is
a failure. Local: 55 total, 55 passed, 0 skipped; 2 integration files, 18
tests executed. With the database unreachable it refuses (verified).

CI: new job **Questura readiness integrations** — Postgres 14 and Redis
services, `readiness check` → `readiness bootstrap` (committed fixture, no
developer dump) → `readiness:launch -- seed` → `readiness:required`. The load
supervisor's policy tests run in the existing no-install client job. The long
local harnesses (publication, restore, adapter, load) stay out of every PR.

## Cloudflare adapter — `pnpm readiness:adapter`: 13/13

- Built in a detached git worktree of `origin/main` under the sandbox state
  directory, dependencies installed **offline** from the local pnpm store
  (0 downloaded). The adapter writes `.next` and ignores `NEXT_DIST_DIR`, so
  building in the real checkout would clobber a running `pnpm dev`.
- `opennextjs-cloudflare preview` (Miniflare, `--remote` off) on 127.0.0.1,
  committed `wrangler.jsonc`, no Cloudflare credentials, metrics off.
- By revision: Worker serves Rn → body saved as Rn+1 → Worker still serves its
  cached Rn → wrong-secret purge 401 and changes nothing → purge with the exact
  tags/paths the backend queued → Worker serves Rn+1, never both.
- Outbound: every attempt refused, none billable — wrangler's own
  `Request.cf` lookup (`workers.cloudflare.com`) and update check
  (`registry.npmjs.org`), and Payload telemetry.

### Findings

1. **Adapter defect (hosted blocker).** `@opennextjs/cloudflare@1.18.1`'s
   `BucketCachePurge` Durable Object passes its tag list to
   `ctx.storage.sql.exec(query, array)` as one binding. With more than one tag
   its alarm throws "Wrong number of parameter bindings" (84 times in one
   local preview); every article save queues four tags. In production the
   zone purge would run, the delete would fail, and the alarm would retry —
   repeated purges and a table that never empties. Needs a patch or an adapter
   version that fixes it before the DO purge is relied on.
2. **Build-time backend URL.** The Worker renders from the backend URL inlined
   at build. A browser-facing name that workerd cannot resolve made every live
   render 500; the smoke builds with the loopback address. Hosted builds must
   inline a backend origin the Worker can actually reach.

## Limits

Loopback only. Emulated bindings prove local execution, not global purge,
cold isolates, Worker CPU limits or real cookies. CI execution of the new job
is verified by this PR's own run.
