import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

// `check:global-css` enforces the entrypoint lists and their order, but it is a
// pnpm script and CI only runs the test suite -- so the rule it guards was
// enforced nowhere a pull request could see. Running it here fails the build
// instead of the next person's cold /join.
test('the global CSS boundary check passes', async () => {
  await assert.doesNotReject(
    () => import('../../../scripts/check-global-css-boundaries.mjs'),
    'check:global-css rejected — run `pnpm --dir apps/questura/apps/client check:global-css` for the reason',
  )
})

// The whole point of the split: a stylesheet that only city, article,
// itinerary and listicle pages can use must not be in the entrypoint every
// route loads. /join used to download 37,142 bytes of it, 5,299 gzipped,
// without matching one of its selectors.
test('globals.css carries only what every route needs', () => {
  const globals = read('../globals.css')

  for (const routeSpecific of [
    'article-prose-and-media.css',
    'editorial-effects.css',
    'featured-articles-shared-and-seven.css',
    'featured-articles-four.css',
    'featured-articles-five.css',
    'featured-articles-nine.css',
    'featured-articles-three.css',
    'responsive-accessibility.css',
  ]) {
    assert.doesNotMatch(
      globals,
      new RegExp(routeSpecific.replace('.', '\\.')),
      `${routeSpecific} is back in globals.css, so /join and /search download it again`,
    )
  }
})

// The public group's stylesheet has to be loaded by the public group's layout.
// Moving the imports out of globals.css without this is how every city page
// loses its layout.
test('the public route group loads its own stylesheet', () => {
  assert.match(read('../(public)/layout.tsx'), /import ["']\.\.\/styles\/public-routes\.css["']/)
})

// Reduced-motion rules override the card animations declared above them, and
// the keyframes the card effects use are declared in editorial-effects.css.
// Both only work if the order holds.
test('the public stylesheet keeps reduced motion last', () => {
  const imports = [...read('./public-routes.css').matchAll(/@import\s+["']([^"']+)["']/g)].map(
    ([, path]) => path,
  )

  assert.equal(imports.at(-1), './global/responsive-accessibility.css')
  assert.ok(
    imports.indexOf('./global/editorial-effects.css') <
      imports.indexOf('./global/featured-articles-shared-and-seven.css'),
    'the card layouts use keyframes declared in editorial-effects.css',
  )
})
