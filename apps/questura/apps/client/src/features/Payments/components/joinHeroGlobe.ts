/*
 * Join hero globe artwork.
 *
 * The source is a 3840x2160 RGBA PNG (3.6MB) kept out of `public/` at
 * `design-assets/join/questurian-globe.png`; it is never served. The widths
 * below are WebP derivatives of it, painted at most at 1650 CSS px:
 *
 *   pnpm exec node -e "const s=require('sharp');for(const w of [1000,1650,2400])\
 *     s('design-assets/join/questurian-globe.png').resize({width:w})\
 *     .webp({quality:72,effort:6})\
 *     .toFile('public/images/join/questurian-globe-'+w+'.webp')"
 *
 * Filenames are width-versioned so `/images/join/*` can be served immutable
 * (see next.config.ts). Bump the names if the artwork itself changes.
 */
export const GLOBE_SRCSET = [
  '/images/join/questurian-globe-1000.webp 1000w',
  '/images/join/questurian-globe-1650.webp 1650w',
  '/images/join/questurian-globe-2400.webp 2400w',
].join(', ');

export const GLOBE_SIZES =
  '(max-width: 768px) 1000px, (max-width: 1536px) 100vw, 1650px';

export const GLOBE_FALLBACK_SRC = '/images/join/questurian-globe-1650.webp';

export const GLOBE_ELEMENT_ID = 'join-hero-globe';

/*
 * Set on <html> once the globe has decoded; membership.css keys the hero
 * enter animations off it. It lives on the document element (not on the hero
 * section) because React renders the section's className and would fight a
 * class we added behind its back.
 */
export const HERO_READY_ATTRIBUTE = 'data-join-hero-ready';
