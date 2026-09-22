# L09 Cloudflare adapter — built and previewed locally, 22 September 2026

Dependency approved by the owner. `@opennextjs/cloudflare` is installed,
pinned, and the Worker has been built and run. **Nothing was deployed and
nothing was provisioned** — `preview` runs the built Worker against
Miniflare's emulated bindings and never contacts a Cloudflare account.

## The version pin, and why it is exact

`@opennextjs/cloudflare@1.18.1` + `wrangler@4.136.2`, both **exact, not
caret**.

`@latest` (1.20.6) declares `next: >=15.5.24 <16 || >=16.3.3`. The client is
on **15.4.11**, so the newest adapter refuses it. Walking the peer ranges
back:

| Adapter | Supports Next 15.4.11 |
|---|---|
| 1.18.1 | **yes** (`~15.4.11` is named explicitly) |
| 1.19.0 | no — floor rises to 15.5.15 |
| 1.20.6 | no — floor 15.5.24 |

So **1.18.1 is the ceiling while the apps stay on Next 15.4.11.** A caret
would let a routine `pnpm install` drift past 1.19.0 and silently break the
compatibility guarantee, which is why both pins are exact — matching how this
repo already pins `next` and `payload`.

Going further needs a Next minor upgrade, which moves *both* apps and is a
separate decision. The plan forbids an unrelated framework upgrade, so it was
not done.

## The Worker runs, and serves the real site

`opennextjs-cloudflare preview`, local backend on :4100, working copy of the
development database:

| Path | Status | Bytes | Title |
|---|---|---|---|
| `/peru/lima` | 200 | 259 183 | Lima, Peru — Questurian |
| `/peru/lima/neighborhoods/the-best-things-to-do-in-barranco-2026` | 200 | 131 165 | Best Things to Do in Barranco, Lima \| 2026 Travel Guide |
| `/sitemap.xml` | 200 | 6 572 | — |
| `/` | 307 | — | redirect, as designed |

## The cycle that matters: cache hit → publish → new content

```
1. warm the page          200  259183B   39ms   Lima, Peru — Questurian
2. read again             200  259183B   14ms   cache hit, byte-identical
3. POST /api/revalidate   200  {"revalidated":true,"tags":["location-homepage:peru:lima"],…}
4. wrong secret           401  {"error":"Unauthorized"}
5. read after purge       200  258510B  310ms   re-rendered, different bytes
```

Step 5 is the proof: **different byte count and 22× the latency of the cache
hit** — the page was genuinely rebuilt, not served from cache. Step 4 is the
other half: an unauthorised invalidation is refused rather than quietly
accepted.

This exercised the R2 incremental cache, the D1 tag cache, the Durable Object
queue and the Durable Object cache purge, all through Miniflare.

## No secret reaches a browser

Rebuilt with distinctive canary values in `QUESTURA_RENDER_TOKEN` and
`QUESTURA_REVALIDATION_SECRET`, then searched the output:

- `.open-next/assets` (everything a browser downloads) — **no match**
- `.open-next/server-functions`, `worker.js` — **no match**

The client chunk contains `process.env.QUESTURA_RENDER_TOKEN` as a *runtime
lookup by name*; because it is not `NEXT_PUBLIC_`-prefixed, no value is
inlined and a browser resolves it to `undefined`. That is the correct
behaviour and it is now demonstrated rather than assumed.

## Four findings

**1. `cachePurge` has to be wired, not just bound.** The first configuration
declared the `NEXT_CACHE_DO_PURGE` binding and left the override unset. That
builds, starts and serves — and does not purge. It is the half-configured
state that looks healthy and leaves the site stale.

**2. Its import specifier needs an explicit `/index`.** The package export map
is `./*` → `./dist/api/*.js`, and `cache-purge` is a *directory*, so
`@opennextjs/cloudflare/overrides/cache-purge` resolves to a file that does
not exist and the build fails. `…/cache-purge/index` is correct. Not a typo —
a comment in `open-next.config.ts` says so, because it reads like one.

**3. The adapter build collides with `pnpm dev`.** The client dev server runs
`next dev --turbopack` and writes turbopack artifacts into `.next`. The
adapter bundles from `.next` and **ignores `NEXT_DIST_DIR`**, so a build run
while the dev server is up fails with
`Could not resolve "../../chunks/ssr/[turbopack]_runtime.js"` — an error that
says nothing about its real cause. This build was done in a **git worktree**,
which is also closer to what Cloudflare will do from a clean checkout.

**4. Wrangler warns that the Durable Object classes are not exported.** They
are — `worker.js` exports `DOQueueHandler`, `DOShardedTagCache` and
`BucketCachePurge`, and the files exist under
`.open-next/.build/durable-objects/`. The warning is `wrangler dev`'s static
analysis failing to follow the re-exports. The revalidation cycle above ran
through those objects, so the warning is cosmetic — but it is the kind of
warning someone will otherwise chase.

## What this still does not certify

Global cache behaviour, purge propagation across regions, isolate lifetime,
CPU and memory limits, cold start, DNS and CDN routing. Miniflare emulates
the bindings; it does not emulate Cloudflare.

And one specific to this codebase: **`LastGood` is per process**, and a
Workers isolate is a far shorter-lived process than a Node server, so the
curated-page fallback is structurally weaker on Workers in a way no local run
can show (`docs/capacity/cache-contract.md`). That remains the open
availability-versus-freshness decision, and it still belongs to hosted
numbers.

All of that is **H03**. Provisioning the real R2 bucket, D1 database and API
token is **H01**, and neither was touched here.
