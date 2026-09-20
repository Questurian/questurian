import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const previewPath = fileURLToPath(new URL('./NewsletterSignupPreview.tsx', import.meta.url))
const artDir = fileURLToPath(new URL('../../../../../../public/images/newsletter/', import.meta.url))

// The newsletter box's background was a 2000x1293 baseline JPEG, 564 KB on the
// wire, with no `srcset` and no CDN behind it -- 28% of every image byte on
// /peru/lima at 1x and 30% of them on a phone. It is the one photograph on a
// city page that is a plain file in public/ rather than a media asset, so
// nothing in the pipeline will catch it going back.
//
// Structure, not sizes: a byte count asserted here passes on the machine that
// wrote it and fails in CI.
test('the newsletter background is a WebP', () => {
  const source = readFileSync(previewPath, 'utf8')
  const src = /src="(\/images\/newsletter\/[^"]+)"/.exec(source)?.[1]

  assert.ok(src, 'NewsletterSignupPreview no longer names a background under /images/newsletter/')
  assert.ok(src.endsWith('.webp'), `the newsletter background is ${src}, not a .webp`)
})

test('no full-size original is left beside it', () => {
  // Deleting the JPEG is half the fix. A re-export that lands next to the old
  // file rather than replacing it ships both.
  for (const name of readdirSync(artDir)) {
    assert.doesNotMatch(
      name,
      /\.(jpe?g|png)$/i,
      `${name} is an uncompressed original in public/images/newsletter/`,
    )
  }
})
