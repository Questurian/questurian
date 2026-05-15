# Cached SSR for public content pages

Questura Client will keep public content pages server-rendered and indexable while allowing cached SSR/ISR responses, refreshed through on-demand revalidation when content changes. Account, auth, payment, and membership pages remain dynamic because they are user-specific and freshness-sensitive. This trades immediate visibility of every Payload write for faster first loads, lower backend pressure, and stable HTML for Googlebot.

Questura Server owns the revalidation signal because it is the production source of truth for Payload content. Payload `afterChange` and `afterDelete` hooks trigger a secret-protected Questura Client revalidation endpoint for the affected public paths or tags; Location Manager and AI Blog Writer do not call Questura Client directly.

Revalidation is tag-first with optional explicit paths. Fetches for public content pages are tagged by their data dependencies, while path revalidation is reserved for route-level changes such as article slug or canonical path changes, deleted content, and other cases where a URL must be regenerated or removed.

Questura Client's production target is Vercel so the public site can rely on first-class Next.js ISR, tag/path revalidation, CDN caching, durable ISR storage, and globally consistent cache purging. Questura Server may run on the platform that best fits Payload and supporting processes, provided it can call Questura Client's revalidation endpoint.

Questura Client separates indexed public content routes from user-specific routes at the route-group shell level. Public content pages live under a cacheable shell, while account, auth, payment, membership, and other user-specific flows remain under a dynamic shell; shared UI such as the navbar may hydrate auth/member controls client-side after the cached HTML is served.

On-demand revalidation is the primary freshness mechanism. Public content fetches and sitemap data also use a one-hour fallback `revalidate` window so missed or delayed hooks self-heal without returning public traffic to live backend reads on every request.

Public content pages continue to render plain `<img>` elements backed by Questura's MediaSet placement variants rather than adopting `next/image` now. Questura Client standardizes this through an internal `PublicImage` component that enforces dimensions, `sizes`, `loading`, `fetchPriority`, `decoding`, and above-the-fold priority rules.

The public shell is server-first. The root layout stays minimal, while React Query, auth modals, user modal, password reset modal, Stripe/payment UI, affiliate tracking, and other user-specific or third-party scripts move into the dynamic/private route group or lazy client islands that load only when needed.
