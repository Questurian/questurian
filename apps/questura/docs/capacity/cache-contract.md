# Cache freshness and fallback contract

*L08 of the local readiness plan, 22 September 2026.*

Five classes of response, five different promises. They were not written down
before, which is how a seven-day number in one file came to be treated as a
maximum content age it never was.

## 1. Public curated pages (city, neighbourhood)

| | |
|---|---|
| Normal freshness | On-demand invalidation is primary; a one-hour `revalidate` is the self-healing floor (ADR-0003). |
| On backend failure | Served from the last good answer **this process** holds, if the **origin** confirmed it within the last hour. |
| Age measured from | The origin's `Date` minus `Age`, supplied by the reader — *not* the time this process last handled the value. |
| Fallback renews freshness? | **No.** Serving a fallback is not the origin confirming anything. |
| Bound | 500 entries **and** 32 MiB per process, oldest first. **A hard ceiling** in the stated unit. |
| Byte unit | UTF-8 length of the value's JSON — an accounting unit, not V8 heap bytes. |
| Oversize or unserialisable value | Refused before anything is evicted; the key's older entry is dropped too (2026-09-22 surge L07). |

**What changed and why.** Every successful read used to reset the clock,
including one the origin never saw. The backend answers `public, s-maxage=60,
stale-while-revalidate=600`, so a Next data-cache hit is a successful read
with no origin round trip — a page could be served from a fallback
indefinitely while each read looked fresh. The stated maximum age was a
maximum of nothing.

Entry count alone was the other half: 500 curated homepages is not a fixed
amount of memory. A city page response is tens of kilobytes and a large one
is far more.

**Oversize values (surge plan L07).** The byte bound used to be soft: one
value larger than the whole budget evicted every other entry and was then
kept anyway (probe: `maxBytes=100` retained 1,002 bytes). A value that cannot
fit is now refused without evicting anything, and the ceiling holds at every
moment. The unit is serialised UTF-8 bytes, stated as such — heap cost is
larger and is not measured here. When a key's newer answer is refused, its
older entry goes too: a fallback older than the origin's latest answer would
serve content the origin has already replaced. `stats().refused` counts these.

**Three clocks, not one.** The fallback *value* window is one hour
(`DEFAULT_FALLBACK_WINDOW_MS`). The route's `revalidate` is also one hour.
Next's `expireTime` (`next.config.ts`) is seven days and governs how long a
stale *rendered page* may be served while it revalidates. A render made from a
fallback value can be stored in the full-route cache like any other, so the
age a reader sees is bounded by none of these alone. Tested: the value window
(`lastGood.test.mjs`). Not tested, and not claimed: a viewer-visible bound.

**The limit this still has.** It bounds the age of the value handed to the
renderer. It does **not** bound the age of the page a reader sees: Next may
store the rendered output in its full-route cache, and nothing available here
can tell that cache "this render was a fallback, keep it briefly". Narrowing
the window from seven days to one hour limits the damage. It does not remove
it. → **Hosted blocker H03.**

## 2. Articles

**No fallback, on purpose.** An article becoming members-only is an access
change, and a stale copy served during an outage would undo it. Failing
loudly is the safe side. This is not an omission and should not be "fixed".

## 3. A genuine 404 or deletion

A 404 is an **answer**, not a failure. It evicts the remembered entry, so a
later outage cannot resurrect a page that was unpublished or deleted. A 503,
a timeout or a transport error is never turned into a 404 or into a cached
empty success (`readPublicResponse`).

## 4. Transient backend errors

Throw. `readPublicResponse` turns any non-404 failure into an error, which
makes the render fail — and a failed render means Next keeps serving the last
good version and does not write the bad answer to its data cache. The
fallback above sits in front of this for curated pages only.

## 5. Private responses

`no-store`, always, and never shared. `/api/me`, bookmarks and member bodies
are per-caller. An overload refusal on a private route stays `no-store` and
retryable so it can never be read as a logout, and never cached by anything.

## Distinct outcomes, written down

These two look similar and are not:

| Situation | Outcome |
|---|---|
| Warm page + time expiry + backend failure | Next serves its stale render while revalidation retries. The reader sees the old page. |
| Tag/path invalidation + backend failure | Next rebuilds *blocking*. Without the fallback this is a 500 for every reader until the backend returns; with it, the last good answer within the window. |

## What needs hosted evidence

Everything about the cache **in front of** the render:

- global purge latency and whether `revalidateTag` reaches every region;
- isolate lifetime — `LastGood` is per process, and a Workers isolate is a
  much shorter-lived process than a Node server, so the fallback is weaker
  there in a way local tests cannot show;
- HTML/RSC/cookie/tracking variants staying separate, and `Set-Cookie` never
  being shared;
- a negative cache clearing on first publish **at the edge** (the Node
  frontend does clear it — `runs/2026-09-22-L05-frontend-cache.md`);
- an access change not being served from a warm **regional** cache (locally
  it is not served from a warm one — same run).

None of it can be claimed from a Mac. It is H03.

## The open decision

Whether curated pages should have a **shared** fallback (KV/R2) so a cold
isolate has something to serve, or whether a cold isolate failing loudly is
acceptable. That is an availability-versus-freshness trade the owner makes,
and it should be made from hosted numbers rather than from the fact that a
storage product exists.
