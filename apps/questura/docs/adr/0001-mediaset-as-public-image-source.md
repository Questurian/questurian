# MediaSet is the public image source

Questura public content references `MediaSet` as the canonical image object, while `MediaAsset` represents uploaded files and specific variants. Existing direct `MediaAsset` fields, such as article featured images, will migrate in phases by adding `MediaSet` fields, reading old asset fields as fallbacks, backfilling records, then removing direct public upload fields once pages and SEO use `MediaSet`; inline editorial body images may remain direct assets until they need variant-aware serving.

Public placements do not require every variant in a `MediaSet`; each placement defines its own minimum required variants. Curated slots fail closed through API/admin validation when their placement requirements are not met, while the public UI may render graceful placeholders instead of picking an arbitrary wrong crop. Temporary legacy fallbacks are allowed only during migration and should be observable.

Image URL selection belongs on the server/API side in one media resolver. Public clients receive placement-ready image payloads such as URL, alt text, dimensions, selected variant, and status, instead of choosing between `asset.url`, `bunny_original_url`, or arbitrary MediaSet variants inside React components.

`bunny_original_url` is not part of the canonical public serving path because it is populated only for 1200x630 uploads and therefore encodes an Open Graph assumption into unrelated placements. It may be read only as an observable migration fallback until normalized asset URLs or generated CDN URLs cover migrated records.

The frontend will render CDN-ready variants with plain `img` elements for now. Next.js image optimization adds remote configuration, cache, and latency concerns that are not needed while Questura already manages explicit MediaSet crops; adopting `next/image` requires a separate decision with `remotePatterns`, dimension, priority, and cache rules.

New public uploads should enter through a `MediaSet` creation or selection workflow, with variants attached as `MediaAsset` records inside the set. Direct `MediaAsset` upload fields are reserved for internal profile images, inline article body images until they need placement-aware serving, migration/backfill tooling, and external images that are not first-class Questura visuals.

For synced location content, Location Manager owns generation of variant files before syncing them to Payload. Questura owns validation of variant attachments, MediaPlacement requirements, and public serving behavior.

`MediaSet.status` should not mean "all variants exist" or gate public rendering. It should be demoted to an admin coarse state such as empty, partial, or usable; placement readiness is decided by a resolver/checker such as `isMediaSetReadyForPlacement(mediaSet, placement)`.

The first placement set is `card`, `square-card`, `wide-card`, `hero`, `article-header`, and `open-graph`. Required variants are `thumbnail`, `square`, `wide`, `hero`, `wide`, and `open_graph` respectively; `wide-card`, `hero`, and `article-header` may use explicitly marked migration fallbacks while existing data is cleaned up.
