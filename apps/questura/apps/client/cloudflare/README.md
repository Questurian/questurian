# Cloudflare adapter

**Status: built and previewed locally. Not deployed, nothing provisioned.**

`@opennextjs/cloudflare` is installed (approved by the owner, 22 September
2026). The Worker builds and serves the real site against emulated bindings.
Evidence: [`docs/capacity/runs/2026-09-22-L09-cloudflare-adapter.md`](../../../docs/capacity/runs/2026-09-22-L09-cloudflare-adapter.md).

## The version pin is exact on purpose

```
@opennextjs/cloudflare  1.18.1
wrangler                4.136.2
next                    15.4.11
```

`1.19.0` raises its Next floor to `>=15.5.15`; `@latest` (1.20.6) wants
`>=15.5.24`. The apps are on **15.4.11**, so **1.18.1 is the ceiling** until
Next is upgraded — and that moves both apps, so it is a separate decision.

A caret on either package would let a routine `pnpm install` cross that
boundary with no error until a build fails. `cloudflare-readiness.test.mjs`
fails if either pin loosens.

## Build and preview

```bash
cd apps/questura/apps/client
pnpm exec opennextjs-cloudflare build
pnpm exec opennextjs-cloudflare preview --port 8790
```

`preview` runs the built Worker on Miniflare. It creates nothing in a
Cloudflare account. `deploy` and `upload` do, and neither is in this recipe.

**Stop `pnpm dev` first, or build in a git worktree.** The client dev server
runs `next dev --turbopack` and writes turbopack artifacts into `.next`; the
adapter bundles from `.next` and **ignores `NEXT_DIST_DIR`**, so a build run
alongside the dev server fails with
`Could not resolve "../../chunks/ssr/[turbopack]_runtime.js"` — an error that
says nothing about its cause.

### Local secrets

`.dev.vars` (gitignored) holds `QUESTURA_REVALIDATION_SECRET` and
`QUESTURA_RENDER_TOKEN` for the preview. Real values are set with
`wrangler secret put` and never committed.

## What must be provisioned before a real deploy (H01)

Every `<PLACEHOLDER>` in `wrangler.jsonc` is an owner decision.

| Component | Binding | Resource |
|---|---|---|
| Incremental cache | `NEXT_INC_CACHE_R2_BUCKET` | an R2 bucket |
| Tag cache | `NEXT_TAG_CACHE_D1` | a D1 database |
| Revalidation queue | `NEXT_CACHE_DO_QUEUE` | Durable Object (`DOQueueHandler`) |
| Cache purge | `NEXT_CACHE_DO_PURGE` | Durable Object (`BucketCachePurge`) + a Cloudflare API token with Cache Purge on the zone, and the zone id |

**All four are required.** Questura publishes by on-demand invalidation
(ADR-0003). Without the tag cache, `revalidateTag` resolves to nothing;
without cache purge, it updates the incremental cache while the CDN keeps
serving the old page. Either way the refresh queue drains clean and the site
stays stale — the failure L01 removed from the backend, one layer up.

Declaring a binding is not enough: `cachePurge` has to be *wired* in
`open-next.config.ts` as well. A configuration with the binding and no
override builds, starts, serves, and does not purge.

## Secrets

`wrangler secret put` for each. Never in `wrangler.jsonc`.

- `QUESTURA_REVALIDATION_SECRET` — must match the backend's, or every
  publication is a 401 the outbox retries forever.
- `QUESTURA_RENDER_TOKEN` — server-only. It must never become
  `NEXT_PUBLIC_`; a render token in a browser bundle is a published bypass of
  the per-IP public read limits. (Verified absent from the built assets with
  a canary value — see the evidence file.)
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` — cache purge only. Cache
  Purge permission on this zone and nothing else.

## What a local preview still cannot certify

Global cache behaviour, purge propagation across regions, isolate lifetime,
CPU and memory limits, cold start, DNS and CDN routing. Miniflare emulates
the bindings; it does not emulate Cloudflare.

And one specific to this codebase: **`LastGood` is per process**, and a
Workers isolate is a far shorter-lived process than a Node server, so the
curated-page fallback is structurally weaker on Workers in a way no local run
can show ([`cache-contract.md`](../../../docs/capacity/cache-contract.md)).

That is H03, and the fallback trade is still the owner's open decision.

## Rollback

Code rollback, not cache rollback. The incremental cache is keyed by build,
so a previous release reads its own entries; the tag cache and the purge
token are shared, so a rollback does not need them reset. What it *does* need
is the backend's revalidation secret staying valid across both generations —
a secret rotation and a rollback in the same window leaves one generation
unable to receive publications.
