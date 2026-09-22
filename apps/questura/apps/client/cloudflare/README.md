# Cloudflare adapter preparation (L09)

**Status: blocked on tooling, not complete.**

`@opennextjs/cloudflare` is not installed. Installing a new dependency needs
the owner's explicit approval (root `AGENTS.md`), and the readiness plan
marks L09 "Local + tool approval" for the same reason. Everything here is the
part that can be done without it: the configuration, the recipe, what has to
be provisioned, and what will still be unknown afterwards.

Saying "complete" here would be the specific dishonesty the plan warns
about — *package installation not approved means blocked on tooling, not
complete.*

## What this frontend is today

Ordinary `next build` / `next start` on Node. No OpenNext dependency, no
Wrangler configuration, no adapter. Node localhost success proves nothing
about Worker compatibility or ISR wiring, because none of that code exists
yet.

## The one command that is waiting for approval

```bash
cd apps/questura/apps/client
pnpm add -D @opennextjs/cloudflare wrangler
cp cloudflare/wrangler.jsonc.template wrangler.jsonc
cp cloudflare/open-next.config.ts.template open-next.config.ts
# fill in every <PLACEHOLDER> in wrangler.jsonc
pnpm exec opennextjs-cloudflare build
pnpm exec opennextjs-cloudflare preview   # local Worker, no deploy
```

`preview` runs the built Worker locally against Miniflare's emulated
bindings. It creates nothing in a Cloudflare account and deploys nothing.
`deploy` and `upload` are the commands that do, and neither is in this
recipe on purpose.

Pin both versions in the lockfile when they are installed, and record which
Next release they were resolved against — the client is on **Next 15.4.11**,
and `cloudflare-readiness.test.mjs` fails if that changes without this file
being revisited.

## What has to be provisioned before it can run anywhere real

None of this exists. Each line is an owner decision and an H01 item.

| Component | Binding | Resource |
|---|---|---|
| Incremental cache | `NEXT_INC_CACHE_R2_BUCKET` | an R2 bucket |
| Tag cache | `NEXT_TAG_CACHE_D1` | a D1 database |
| Revalidation queue | `NEXT_CACHE_DO_QUEUE` | Durable Object (`DOQueueHandler`) |
| Cache purge | `NEXT_CACHE_DO_PURGE` | Durable Object (`BucketCachePurge`) + a Cloudflare API token with Cache Purge on the zone, and the zone id |

**All four are required, not optional.** Questura's publishing model is
on-demand invalidation (ADR-0003). Without the tag cache, `revalidateTag`
resolves to nothing. Without cache purge, it updates the incremental cache
while the CDN keeps serving the old page. Either way the refresh queue drains
clean and the site stays stale — which is precisely the failure L01 spent its
time removing from the backend, reintroduced one layer up.

The old repository note that this needed "R2/KV" was not a complete,
version-specific configuration. This is closer, and it still has to be
rechecked against the exact adapter version chosen at install time.

## Secrets

Never in `wrangler.jsonc`. `wrangler secret put` for each:

- `QUESTURA_REVALIDATION_SECRET` — must match the backend's, or every
  publication is a 401 the outbox retries forever.
- `QUESTURA_RENDER_TOKEN` — server-only. It must never become
  `NEXT_PUBLIC_`; a render token in a browser bundle is a published bypass of
  the per-IP public read limits.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` — cache purge only. Cache
  Purge permission on this zone and nothing else.

## What a local Worker preview still cannot certify

Global cache behaviour, purge propagation across regions, isolate lifetime,
CPU and memory limits, cold start, DNS and CDN routing. And one specific to
this codebase: **`LastGood` is per process**, and a Workers isolate is a much
shorter-lived process than a Node server, so the curated-page fallback is
structurally weaker on Workers in a way no local run can show
(`docs/capacity/cache-contract.md`).

Those are H03.

## Rollback

Code rollback, not cache rollback. The incremental cache is keyed by build,
so a previous release reads its own entries; the tag cache and the purge
token are shared, which means a rollback does not need them reset. What it
*does* need is for the backend's revalidation secret to stay valid across
both generations — a secret rotation and a rollback in the same window would
leave one generation unable to receive publications.
