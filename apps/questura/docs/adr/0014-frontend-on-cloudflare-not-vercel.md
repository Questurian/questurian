# Frontend on Cloudflare, not Vercel

*2026-09-21. Replaces the platform paragraph of ADR-0003; the rest of ADR-0003 stands.*

Questura Client's production target is Cloudflare, not Vercel. The owner's reason is cost. The intended serverless stack is Cloudflare for the frontend, Railway for Questura Server, Neon for Postgres and Redis on Railway beside the server. Bunny stays the image CDN. Nothing is provisioned yet, and this is a direction rather than a contract.

The ADR-0003 caching model does not change: public pages are cached SSR/ISR, the server owns the revalidation signal, invalidation is tag-first, and the fallback window is one hour. What changes is who provides it. Vercel provided ISR storage, tag purging and the CDN out of the box. On Cloudflare they come from the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`), which runs on Workers. The older `next-on-pages` path does not support ISR, so "Cloudflare Pages" in practice means Workers with OpenNext. The adapter needs an incremental cache (R2 or KV), a tag cache and a revalidation queue before `revalidateTag` purges anything. None of this is set up yet. CAP-08 has to prove it on the target, because a cache HIT header does not show that revalidation works.

Consequences recorded in `docs/capacity/cap07-platform-readiness.md` §1a: the curated-page last-good fallback lives in process memory and is much weaker on Workers isolates, and `TRUSTED_PROXY` has no `railway` entry yet.
