# Location and join performance sweep — 2026-09-20

Local investigation; no deployment, Stripe calls, or checkout. Baseline was an
existing Next.js 15.4.11 **production build** on localhost:3000, not `next dev`.
The backend used for API timings was localhost:4000. Local data is scratch;
these measurements say nothing about live Stripe or the laptop database.

## What changed

- `/join` is now server-rendered, including pricing markup. Presentation helpers
  are separate from React Query, so the page no longer bundles its plans hook
  or a query provider. The globe was already a small static WebP, not a map SDK.
- Removed the globe decode gate and entrance delays. Previously the headline
  started hidden, waited for image decode (or a 2.5-second fallback), then used
  420/700 ms delays and 820 ms reveals. Existing ambient artwork motion remains.
- Explicit loopback frontend configuration renders both catalog plans directly
  in HTML: $12.99/month and $79.99/year. Disabled arrows have no href. FAQ,
  savings, payment-method copy, and bottom CTA are visible. No payment request.
- Deployed origins still use validated backend availability. The read moved
  server-side with a 60-second cache and three-second timeout. The hero can
  stream first on a cold read. No live failure falls back to local fixtures.
  Checkout validation remains unchanged. Availability can lag a cache window.
- Desktop and mobile Subscribe links no longer wait for authentication. Once
  membership resolves, an active member's link is hidden as before. A member
  can briefly see Subscribe while their session resolves; the public link is
  deliberately usable during that interval.
- Pricing-card backgrounds use the existing warm `paper` token.

## Measurements and limits

| Measurement | Before | After |
|---|---:|---:|
| `/join` initial script URLs, total decoded bytes | 521,107 | 467,059 |
| Same scripts, independently gzip-compressed | 162,828 | 144,460 |
| Globe artwork files | 32 / 70 / 120 KiB | unchanged |
| Browser dependency on plans API for `/join` | required after hydration | none |
| Hero image-decode/reveal gate | present | removed |

Script totals sum unique external script URLs in the document, including the
nomodule polyfill. They are an asset inventory, **not actual modern-browser
transfer totals**, and exclude later imports/prefetches. Next's new build reports
104 kB first-load JS for `/join`; framework code remains. Full plan markup makes
HTML larger than the old page that rendered only a loading message. This is a
trade of additional visible HTML for less JavaScript and no browser API waterfall.

Baseline individual HTTP samples: join 31 ms total, Lima 119 ms total. A later
five-request warm-cache run returned join in 5–41 ms and Lima in 7–10 ms. Do not
interpret that difference as a proven speedup: caches/process conditions differ,
and Lima's content-rendering implementation was not changed by this pass.

Local backend samples (three requests, milliseconds):

- Homepage API `/api/public/location-homepages/peru/lima`: **2310, 745, 1439**;
  56,251-byte response.
- Navigation menu API `/api/public/locations/menu`: **360, 48, 80**;
  864-byte response.
- Plans API `/api/payments/plans`: **19, 17, 22**; returns `{"plans":[]}`.

No browser performance trace, throttled LCP/INP/CLS, or Forbes comparison was
captured. HTTP and asset measurements do not establish those metrics.

## Remaining findings, ranked

1. **Cold location assembly is the largest measured remaining wait.**
   The city endpoint queries location, then homepage, then looks up that same
   location again for scope, then resolves blocks. Blocks run concurrently,
   but featured-article slots inside each block use sequential `findByID`
   calls at depth 3. Repeated articles across blocks can repeat work.
   Evidence: `apps/server/src/app/api/public/location-homepages/[country]/[city]/route.ts`,
   `features/homepage-featured-content/resolve-page-blocks/operations/resolve-scope.ts`,
   and `featured-articles/operations/selection.ts` plus `lib/repository.ts`.
   Next step: time those phases and count queries on scratch data; reuse the
   already loaded location, batch references by collection, and deduplicate
   within a request. Preserve slot order, publication/access rules and media
   placement resolution. Parallelizing every query indiscriminately could
   overload the connection pool. Cached pages mask this cost until a miss.

2. **“Lazy” modal code starts at page mount.**
   `ClientInteractionProvider.tsx` dynamically imports four modal renderers but
   renders all four immediately. Their modal implementations are statically
   imported; returning null inside a closed modal does not avoid that download.
   Next step: retain tiny store subscribers and import heavy modal bodies on
   intent/open, optionally warm on pointer/focus. Preserve navbar menu initial
   data so reducing downloads does not reintroduce a data fetch on click.

3. **Some location images still wait for hydration.**
   `FeaturedArticleCarouselPreview.tsx` and `QuestUrianMapsPreview.tsx` render
   image opacity 0 until client state sees load/completion, followed by a
   300 ms fade. The earlier pass fixed text gating but these image gates remain.
   This is layout-dependent; it is not a measured cause of Lima's current
   first-block load. Next step: let images paint natively in reserved aspect
   ratios and retain error handling without gating successful images.

4. **Scrolling is deliberately delayed.**
   `Navigation/Navbar.tsx` prevents default wheel scrolling while absorbing
   120 pixels of wheel input into navbar collapse, then follows with a lerp.
   This can feel slow even with everything downloaded. Next step: collapse
   from actual scroll position using passive input. This changes interaction
   design, so it was documented rather than silently removed.

5. **Shared CSS/fonts remain broader than route needs.**
   Baseline join had four font preloads and approximately 176 KB of linked CSS
   (28 KB independently gzipped); Lima had six font preloads. Root globals
   include article and all featured-layout styles on the sales page.
   Next step: measure coverage, then move feature CSS to appropriate layouts
   and preload only fonts used above the fold. Keep shared ring styles and
   cascade order intact; `membership.css` also contains tour-card rules.
   Likely secondary to the waits above, especially with a warm cache.

6. **First-block image priority is blanket, not viewport-aware.**
   `heroImagePriority.ts` marks every item in block zero high/eager. Lima has
   seven first-block items. Sensible for its wide desktop composition, but
   other layouts/mobile carousels can prioritize offscreen images too.
   Next step: verify which images are visible per layout/breakpoint before
   narrowing priority. Do not undo the earlier fix by starving visible cards.

7. **Public shell menu read has no deadline.**
   `PublicChrome.tsx` awaits `getLocationMenu.ts` before returning chrome. Its
   cache usually hides this, but a cold backend stall delays the shell until
   fetch fails. Next step: bound that public read and/or stream the menu island
   without delaying the public Subscribe link. Measure cold routes as well as
   warm routes when validating this.

These findings apply across shared location components, but country and
neighborhood pages were not individually timed. Payload admin uses a different
application shell; no claim of measured admin improvement.

## Next comparison

Keep production-mode builds and identical viewport/device/network conditions.
Measure cold document loads, repeat visits and navbar navigation separately;
record LCP/INP/CLS and resource waterfalls. Test with slow or unavailable auth,
plans and globe requests. For serverless launch, verify CDN cache hits and
backend region placement; nearby servers cannot fix intentional opacity or
auth gates. No laptop-only infrastructure is needed.

Primary references: [Next.js server/client boundaries](https://nextjs.org/learn/react-foundations/server-and-client-components)
and [web.dev LCP load versus render delay](https://web.dev/articles/optimize-lcp).
