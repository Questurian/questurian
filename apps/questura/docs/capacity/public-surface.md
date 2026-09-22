# Public read surface (CAP-04 inventory, 2026-09-21)

Every way an anonymous caller can make the backend read, and what bounds it.
"Wrapper" = `publicRead` (`apps/server/src/shared/http/public-read.ts`): per-IP
rate limit (render-token bucket for the frontend), admission gate, request
counting, `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` on
success and `private, no-store` on errors and overload.

## Custom routes (`/api/public/*`)

| Route | Caller | Scope / limit per IP per min | Gate | Before CAP-04 |
|---|---|---|---|---|
| `location-homepages/[country]/[city]` | frontend render | `locationHomepage` 120 | assembly, coalesced | wrapped |
| `location-homepages/[country]/[city]/[neighborhood]` | frontend render | `locationHomepage` 120 | assembly, coalesced | **no limit, no gate, no coalescing, no cache header** |
| `articles/search` | frontend, browser | `search` 60 | query | wrapped |
| `articles/by-location` | frontend | `locationFeed` 120 | query | wrapped |
| `articles/index` | frontend | `articleIndex` 120 | query | wrapped |
| `authors/[slug]` | frontend | `authorPage` 60 | query | wrapped |
| `articles/by-canonical-path` | frontend | `articleRead` 240 | query | **unwrapped** |
| `articles/by-id` | frontend | `articleRead` 240 | query | **unwrapped** |
| `articles/related` | frontend | `related` 120 | query | **unwrapped** |
| `sitemap-entries` | frontend (sitemap, build) | `sitemap` 30 | query | **unwrapped** |
| `locations/menu` | frontend, browser | `navigation` 240 | none (depth-0 reads) | **unwrapped** |
| `countries/[country]/cities` | frontend | `navigation` 240 | none | **unwrapped** |
| `redirects/by-path` | frontend | `navigation` 240 | none | **unwrapped** |
| `locations/search` | browser | `navigation` 240 | none | **unwrapped** |
| `articles/full` | browser, member content | own fail-closed limiter, private | — | unchanged on purpose: identity-dependent, never shared-cacheable |

`/api/me` and `/api/account/bookmarks/refs`: identity, private `no-store`,
no gate by design (CAP-03: anonymous calls do no database work).

### Aggregate bounds (L07, 2026-09-22)

Every scope above — including `navigation`, which has no work gate — now
passes through an **ingress** gate *before* the rate limiter. The ordering is
the point: the limiter is a Redis call. It fails open when Redis is
unavailable, which is right, but "fails open" describes the answer, not the
wait. A half-open Redis answers slowly, so every arriving request sits in the
limiter until its command deadline, and nothing bounded how many requests
could be sitting there. A deadline caps one command; it says nothing about
how many requests are holding one.

| Gate | Default | Env |
|---|---|---|
| `ingress` (every public read) | 64 active, 128 queued, 1 s wait | `PUBLIC_INGRESS_*` |
| `assembly` (curated pages) | 2 active, 8 queued, 1.5 s | `PUBLIC_ASSEMBLY_*` |
| `query` (search, feeds, indexes) | 8 active, 32 queued, 1.5 s | `PUBLIC_QUERY_*` |
| `private` (signed-in `/api/me`) | 16 active, 64 queued, 1.5 s | `PRIVATE_READ_*` |

`private` applies to `/api/me` **only when a session cookie is present**. An
anonymous identity check still does no database or Redis work and never
reaches the gate (CAP-03). A refusal there stays `no-store` and retryable, so
it can never be read as a logout.

Redis calls from the shared rate-limit counter run behind a circuit breaker
(`shared/lib/circuit-breaker.ts`): five consecutive failures and calls fail
immediately for five seconds, with one probe to notice recovery. What a
failure *means* is unchanged — public reads fail open, payments fail closed —
only the wait changes. Stripe webhooks do not use the public limiter and are
untouched.

## Payload's own mounts (`/api/<collection>`, `/api/graphql`)

Anonymous REST reads succeeded for: `media-assets`, `media-sets`,
`single-type-listicles`, `article-redirects`, `locations`, `accommodations`,
`dining`, `attractions`, `tours`, `nightlife`, `key-locations`,
`affiliate-products`, `instagram-posts`, `perfect-for-tags`, `currencies`, the
`main-homepage` global, and GraphQL. Refused (401/403): users, service
accounts, authors, email logs, visitor profiles, bookmarks, articles (REST
paywall gate, PR #321), listicle itineraries, location homepages, Stripe
events.

**Measured before:** `GET /api/locations?limit=1000&depth=10` → 200,
**271 MB in 1.3 s**, anonymous. `single-type-listicles?limit=100&depth=10` →
8.7 s, then 500. No rate limit, no bound.

**L06 (2026-09-22)** closed three gaps the per-collection hook could not
reach, at the route instead (`shared/payload/mount-bounds.ts`):

- **Globals.** The `beforeOperation` plugin decorates collections.
  `/api/globals/main-homepage` is anonymously readable and took `depth` from
  the query string, so it was unbounded by exactly the mechanism that bounds
  everything else. The route clamps `depth`, `limit` and `pagination` in the
  URL before Payload parses it, which covers collections and globals alike.
- **The request, as opposed to the read.** A hook admits nothing. Anonymous
  GET now holds a `query` admission slot for the whole request — released
  when the SQL has finished, not when the hook returned — so the mount cannot
  hold the Payload pool while `/api/public/*` queues behind it.
- **GraphQL is closed to anonymous callers.** One POST can carry many aliased
  root fields, fragments and relationship selections, so a per-read clamp
  bounds each read and not the request. Nothing in this repository calls
  `/api/graphql` — not the client, not the writer, not Location Manager,
  which syncs over REST — so a real cost limiter would be expensive machinery
  for a surface with no consumer. Anonymous gets 401; a request carrying a
  credential goes to Payload, which authenticates it properly. **If a public
  GraphQL consumer ever appears, `mount-bounds.ts` is the file to reopen, and
  the cost limiter becomes worth building at that point.**

The generated route files are designed to be overwritten, so the guard is a
test: `mount-bounds.test.ts` fails if a regeneration drops either wrapper.

**Still** (`apps/server/src/shared/payload/anonymous-api-bounds.ts`): anonymous
REST/GraphQL reads are rate limited (`payloadApi`, 120/min per IP), clamped to
`limit ≤ 100`, `depth ≤ 2`, pagination forced on. Signed-in staff and service
accounts (admin, writer, Location Manager — they use `limit` up to 200) and
the Local API are untouched.

**Open decision (not taken here):** whether each of those collections should
be anonymously readable at all. The public site does not read them through
the mount. Narrowing `access.read` is a per-collection product decision with
consumers outside this repo's frontend (the writer, Location Manager), so it
is listed, not done.

## Frontend caching (local production build, `next start`)

| Check | Result |
|---|---|
| `/peru/lima` repeat | `x-nextjs-cache: HIT` |
| `?utm_source=…&utm_medium=…`, `?fbclid=…` | HIT — ISR key ignores query on these static routes |
| Request with a visitor session cookie | HIT, identical HTML; nothing personal is rendered into shared HTML |
| RSC request (`RSC: 1`) | HIT, `text/x-component`, `Vary: RSC, …` |
| Unknown city | 404, cached (then HIT) — publishing it revalidates its path |
| HTML `Cache-Control` | was `s-maxage=3600, stale-while-revalidate=31532400` (1 year); now `…=601200` (7 days, `expireTime`) |
| 250 cached pages/s, one process | 0 failures, p99 45 ms |

**Not provable locally, owed to CAP-07/08:** that the target CDN honours tag
purges, keys ISR pages without tracking parameters, never caches responses
with `Set-Cookie`, and does not sit in front of the backend's public API for
*render* traffic (a shared cache there could hand a just-invalidated page's
old JSON back to the frontend, which would then re-cache it for an hour —
the backend sends `stale-while-revalidate=600`). Cache-control headers are not
proof of a CDN hit.

## Failure semantics

- Curated-page repositories (featured articles, hotels, tours, attractions,
  location grid, author and editorial features) omit a slot only when the
  document is **not found**; any other error propagates (500, uncached).
- Frontend: city/neighbourhood homepage, location content lists and the
  sitemap treat only 404 as "no such page"; every other status throws.
  Secondary shelves (related, listicle footer) keep degrading to empty — an
  existing, documented owner choice.
- Next 15.4 regenerates **blocking** after tag/path invalidation, so a publish
  during a backend outage used to turn the page into a 500. Curated city and
  neighbourhood pages now fall back to the last good answer this process saw
  (≤ 7 days, 500 URLs, per process). Articles do not, so an access change can
  never be undone by a stale copy; they fail loudly and recover on their own.
- Delete/unpublish of content a curated page references is refused by the
  existing reference locks (**verified existing**). Edits to a featured
  article reach its card on the hourly fallback revalidate.

## Render traffic and the per-IP limit

Server-side renders reach the backend from the frontend's egress IP. Without
a token they all share one per-IP bucket. With `QUESTURA_RENDER_TOKEN` (32+
chars, same value on both apps) the frontend's reads get their own bucket at
20× the per-IP limit (`PUBLIC_READ_RENDER_MULTIPLIER`). The admission gates
still apply. The real proxy chain on the target platform must be checked
before relying on either (CAP-07).
