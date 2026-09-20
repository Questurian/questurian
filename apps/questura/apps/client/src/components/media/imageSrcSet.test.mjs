import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { VARIANT_WIDTHS, WIDTH_LADDER, buildSrcSet } from './imageSrcSet.ts'

const PROXY = 'https://api.questurian.com/api/media-assets/file/lima-bar-12_square.webp'
const CDN = 'https://questurian-cdn.b-cdn.net/media/lima-bar-12_wide.webp'

test('a variant URL gets the full ladder plus itself on top', () => {
  const base = 'https://api.questurian.com/api/media-assets/file/lima-bar-12'
  assert.equal(
    buildSrcSet(`${base}_square.webp`),
    [
      `${base}_square_w128.webp 128w`,
      `${base}_square_w256.webp 256w`,
      `${base}_square_w384.webp 384w`,
      `${base}_square_w640.webp 640w`,
      `${base}_square_w960.webp 960w`,
      `${base}_square.webp 1080w`,
    ].join(', '),
  )
})

test('the same rule works before and after images move to the CDN', () => {
  // The rungs are files, not query parameters, so they serve through Payload's
  // proxy today and through the pull zone later. Nothing here waits on that
  // routing change.
  assert.match(buildSrcSet(PROXY), /_square_w128\.webp 128w/)
  assert.match(buildSrcSet(CDN), /_wide_w128\.webp 128w/)
})

test('the top rung is the variant own size, so full quality stays reachable', () => {
  assert.match(buildSrcSet(CDN), /_wide\.webp 1920w$/)
  assert.match(buildSrcSet(PROXY), /_square\.webp 1080w$/)
})

test('a 40px thumbnail can reach a 128px file', () => {
  // The acceptance criterion from the issue: the guides menu and related shelf
  // draw 40x40 and used to pull 1920x1080.
  assert.equal(buildSrcSet(PROXY).split(', ')[0].endsWith('_w128.webp 128w'), true)
})

test('a deduplicated filename is still the shape it says it is', () => {
  // Payload appends `-2` when the name is taken. Two thirds of the media zone
  // looks like this, and the file is the same shape at the same size, so
  // skipping them would leave most of the site downloading at full size.
  const base = 'https://api.questurian.com/api/media-assets/file/hotel-b_1777233326269_thumbnail-2'
  const srcSet = buildSrcSet(`${base}.webp`)
  assert.match(srcSet, /_thumbnail-2_w128\.webp 128w/)
  assert.equal(srcSet.endsWith(`${base}.webp 1200w`), true)
})

test('a rung is named .webp even when the variant is not', () => {
  // The generator encodes every rung as WebP, and Bunny types a response from
  // the file extension rather than the Content-Type it was uploaded with -- so
  // a WebP body under a `.jpeg` name is served as image/jpeg.
  const base = 'https://questurian-cdn.b-cdn.net/media/scooter-tour_editorial'
  const srcSet = buildSrcSet(`${base}.jpeg`)
  assert.match(srcSet, /_editorial_w128\.webp 128w/)
  assert.doesNotMatch(srcSet, /\.jpeg/)
})

test('a non-WebP variant is not offered as the top rung', () => {
  // 119 of the 5,186 variant files are still PNG or JPEG, because
  // `media-assets` is an ordinary upload collection and two clients post
  // straight to it. Naming the variant as the top rung put those originals
  // back on the page: `sizes` x devicePixelRatio passes 960 at DPR >= 2.35,
  // and /peru/lima then pulled 4.4 MB of PNG at 1280x900 @3x. The ladder tops
  // out at 960 for these, so no browser can reach the original.
  for (const original of [
    'https://questurian-cdn.b-cdn.net/media/exquisito-peru_thumbnail.png',
    'https://questurian-cdn.b-cdn.net/media/scooter-tour_editorial.jpeg',
    'https://questurian-cdn.b-cdn.net/media/day-trip_thumbnail.jpg',
  ]) {
    const srcSet = buildSrcSet(original)
    assert.doesNotMatch(srcSet, /\.(png|jpe?g)/i, `${original} is still reachable through srcSet`)
    assert.equal(srcSet.endsWith('_w960.webp 960w'), true)
  }

  // A WebP variant keeps its top rung, so full quality stays reachable for
  // everything the pipeline actually produced.
  assert.equal(buildSrcSet(CDN).endsWith('_wide.webp 1920w'), true)
})

test('a genuinely compound name still falls through', () => {
  // `_wide-thumbnail` is a thumbnail OF a wide crop, not a deduplicated
  // thumbnail, and nothing generated rungs for it.
  assert.equal(buildSrcSet(`${CDN.replace('_wide', '_wide-thumbnail')}`), undefined)
  assert.equal(
    buildSrcSet('https://questurian-cdn.b-cdn.net/media/a_wide-1-thumbnail.webp'),
    undefined,
  )
})

test('an unrecognized URL gets nothing rather than a guess', () => {
  // No small siblings were ever generated for these, and a srcSet entry that
  // 404s is a broken image, not a fallback.
  assert.equal(buildSrcSet('/images/join/questurian-globe-1650.webp'), undefined)
  assert.equal(buildSrcSet('https://cdn.example.com/media/photo.webp'), undefined)
  assert.equal(buildSrcSet('https://cdn.example.com/media/photo_banner.webp'), undefined)
  assert.equal(buildSrcSet(''), undefined)
})

test('a rung file is never given a ladder of its own', () => {
  // `..._square_w384` parses its variant as `square_w384`, which is not a
  // variant, so it falls through to undefined.
  assert.equal(buildSrcSet(`${CDN.replace('.webp', '_w384.webp')}`), undefined)
})

test('a query string survives on every rung', () => {
  const signed = `${CDN}?token=abc&expires=1`
  const srcSet = buildSrcSet(signed)
  assert.match(srcSet, /_wide_w128\.webp\?token=abc&expires=1 128w/)
  assert.equal(srcSet.endsWith(`${signed} 1920w`), true)
})

/**
 * The client cannot import the server, so these two tables are copied. That is
 * only safe while something checks the copies, because a drift here does not
 * fail loudly — it asks the CDN for a file the generator never wrote, and the
 * reader sees a hole where a photo should be.
 */
const SERVER = new URL('../../../../server/src/features/media/pipeline/', import.meta.url)

test('the ladder matches the server that writes the files', () => {
  const source = readFileSync(new URL('./width-ladder.ts', SERVER), 'utf8')
  const declared = /export const WIDTH_LADDER = \[([^\]]+)\]/.exec(source)?.[1]

  assert.ok(declared, 'WIDTH_LADDER not found in the server pipeline')
  assert.deepEqual(
    declared.split(',').map((entry) => Number(entry.trim())),
    WIDTH_LADDER,
  )
})

test('the variant widths match the server specs', () => {
  const source = readFileSync(new URL('./variant-specs.ts', SERVER), 'utf8')
  const specs = Object.fromEntries(
    [...source.matchAll(/^\s{2}(\w+):\s*\{\s*width:\s*(\d+)/gm)].map(([, name, width]) => [
      name,
      Number(width),
    ]),
  )

  assert.deepEqual(specs, VARIANT_WIDTHS)
})

test('every rung stays below the smallest variant', () => {
  // This is what lets the client emit the whole ladder for every variant
  // without knowing which files the generator chose to write.
  const smallest = Math.min(...Object.values(VARIANT_WIDTHS))
  assert.equal(smallest, 1080)
  for (const width of WIDTH_LADDER) assert.ok(width < smallest, `${width} is not below ${smallest}`)
})
