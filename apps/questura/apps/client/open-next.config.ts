/**
 * OpenNext adapter configuration for Questura Client (ADR-0014).
 *
 * The four components are not a menu. Questura invalidates on demand
 * (ADR-0003, docs/capacity/cache-contract.md): the backend's refresh outbox
 * calls POST /api/revalidate, which calls revalidateTag and revalidatePath.
 * Without the tag cache those calls resolve to nothing, and without cache
 * purge they update the incremental cache while the CDN keeps serving the old
 * page. Either way the queue drains clean and the site stays stale — which is
 * exactly the failure L01 spent its time removing from the backend, so
 * reintroducing it in the adapter would waste that work.
 *
 * Cache purge is configured by binding (NEXT_CACHE_DO_PURGE) plus a
 * Cloudflare API token and zone id; see wrangler.jsonc.
 */

import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
// `/index` is not a typo. The package's export map is `./*` →
// `./dist/api/*.js`, and cache-purge is a directory rather than a file, so
// the bare specifier resolves to a path that does not exist.
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: d1NextTagCache,
  queue: doQueue,
  // The component that actually evicts the CDN. Declaring the
  // NEXT_CACHE_DO_PURGE binding without wiring this override is the
  // half-configured state that looks fine and leaves the site stale:
  // revalidateTag updates the incremental cache and the edge keeps serving
  // the old page.
  cachePurge: purgeCache({ type: 'durableObject' }),
  // Off deliberately: interception serves cached pages before the Next
  // server runs, which would bypass the navbar/auth-slot work and the
  // per-request headers the backend's paywall relies on. Revisit only with
  // hosted evidence.
  enableCacheInterception: false,
})
