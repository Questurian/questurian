# L05 — the frontend page cache

*22 September 2026. `pnpm readiness:frontend-cache`: both apps as production
builds against `questura_readiness_scratch`. 12/12 checks passed.*

## The question

`pnpm readiness:publish` proves the publishing chain in 24 checks, and every
one of them stops at *"the frontend acknowledged the invalidation"*. A 200
from `/api/revalidate` means `revalidateTag` was called. It does not mean a
tag matched anything, that the full-route cache was rebuilt, or that a cached
404 stopped being served.

The failure this whole series exists to remove is a queue that drains
perfectly while the site stays stale. Acknowledgement is not the page.

## Setup

Backend and client both built for production into `.next-readiness` and run
on 4100 and 3100, sharing one revalidation secret, against the scratch
database. The harness boots its own Payload to write, and drains the outbox
itself — the serving backend's worker is off, so nothing races the
observations. Article 31 (`/colombia/medellin/neighborhoods/where-to-stay-in-medelln…`);
fifteen earlier articles were skipped because they are pinned to a curated
homepage and cannot be unpublished.

## What was observed

**A publish produces the new page.** After a title change and a drain, the
page carried the new title and not the old one.

**The rebuild is a real backend read, and the next read is not.** The
backend's cumulative ingress admissions went `0 → 4` across the rebuild and
then `4 → 4` across the following read. The page is genuinely being served
from the frontend's cache.

**A negative cache clears on first publish.** Unpublishing made the page a
404; a second reader got the same 404, so the negative answer was cached.
Publishing again brought it back as a 200 with content — the cached "gone"
did not survive.

**An access change is not served from a warm cache.** With the article free,
an anonymous reader got the body and no paywall. After flipping it to
members-only and draining, the same anonymous request got the paywall, and
the page shrank from 150,976 to 90,052 bytes. The body really was withheld.

This is the invalidation that must never be missed — a stale copy is the
paywall not applying — and until now it had only been asserted.

## The check that was wrong first, and why it matters

The first version compared the backend's admission counter across two reads
*before* any publish, and passed on `0 → 0`. That proved nothing twice over:

1. A leftover backend from an earlier command was answering on port 4100 with
   a different `DB_STATS_SECRET`, so the counter was never read at all. The
   helper returned `-1` on failure and the check compared `-1` to `-1`.
2. Even with the right server, the counter was zero because the client build
   **pre-renders every public URL** (PR #604), so the running client had never
   asked the backend about that page. *"The backend was not asked again"* is
   satisfied just as well by *"the backend was never asked"*.

Both are now closed: the helper throws instead of returning a sentinel, the
harness refuses to start if either port is occupied, and the counter must be
seen **moving** on the rebuild before an unchanged counter is allowed to mean
a cache hit.

## What this does not settle

This is the Node frontend: one long-lived process, one filesystem full-route
cache. Cloudflare uses R2, D1 and a purge API across many short-lived
isolates. A pass here bounds the hosted question from below; it does not
answer it. Global purge latency, regional propagation, isolate lifetime and
cookie/variant separation remain **H03** (`cache-contract.md`).
