import assert from 'node:assert/strict'
import test from 'node:test'
import { planArticleAds, splitProse } from './adPlacement.ts'

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
const para = (n = 100) => `<p>${words(n)}</p>`
const h2 = (label = 'Section') => `<h2>${label}</h2>`
const h3 = (label = 'Sub') => `<h3>${label}</h3>`
const h4 = (label = 'Item') => `<h4>${label}</h4>`

/** A body of `sections` sections, each a heading plus one 200-word paragraph. */
const body = (sections, heading = h2) =>
  Array.from({ length: sections }, (_, i) => heading(`S${i}`) + para(200)).join('')

const textBlock = (content) => ({ id: 't', blockType: 'text', content })

/** The deep-slot rules are stated in isolation; the opening bar has its own block. */
const noBanner = { banner: false }

/** Words in the run before the first slot -- how far in the opening ad sits. */
const firstSlotAt = (plan) => {
  const runs = plan.proseRuns.get(0)
  if (!runs) return Infinity
  return runs[0].replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
}


// --- splitProse -------------------------------------------------------------

test('splitProse keeps a list whole rather than splitting its items', () => {
  const segments = splitProse('<p>intro</p><ul><li>a</li><li>b</li></ul><p>after</p>')
  assert.deepEqual(
    segments.map((s) => s.html),
    ['<p>intro</p>', '<ul><li>a</li><li>b</li></ul>', '<p>after</p>'],
  )
})

test('splitProse survives nesting of the same tag', () => {
  const segments = splitProse('<ul><li>a<ul><li>b</li></ul></li></ul><p>after</p>')
  assert.equal(segments.length, 2)
  assert.equal(segments[1].html, '<p>after</p>')
})

test('splitProse marks only h2 and h3 as anchors', () => {
  const segments = splitProse(h2() + h3() + h4() + para(3))
  assert.deepEqual(
    segments.map((s) => s.anchor),
    [true, true, false, false],
  )
})

test('splitProse handles void tags and attributes', () => {
  const segments = splitProse('<p class="x">a</p><hr /><img src="y"><p>b</p>')
  assert.equal(segments.length, 4)
})

// --- placement --------------------------------------------------------------

test('a short body carries no ad at all', () => {
  const plan = planArticleAds([textBlock(body(2))], noBanner)
  assert.equal(plan.count, 0)
})

test('every slot on a standard article is a thin bar', () => {
  const plan = planArticleAds([textBlock(body(20))])
  const variants = [...(plan.proseAds.get(0) ?? []), ...plan.afterBlock.values()]
  assert.ok(variants.length > 1)
  assert.deepEqual([...new Set(variants)], ['banner'])
})

test('a longer body carries more bars, up to a ceiling', () => {
  const counts = [4, 8, 20, 60].map((n) => planArticleAds([textBlock(body(n))]).count)
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i] >= counts[i - 1], `not monotonic: ${counts}`)
  }
  assert.ok(counts[0] >= 2, `a 4-section body should carry more than one bar: ${counts}`)
  assert.ok(counts[counts.length - 1] <= 8, `ceiling breached: ${counts}`)
})

test('the first ad waits until the reader is into the article', () => {
  const plan = planArticleAds([textBlock(body(8))], noBanner)
  const runs = plan.proseRuns.get(0)
  const opener = runs[0].replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
  assert.ok(opener >= 300, `first ad after only ${opener} words`)
})

test('every ad lands in front of a heading, never under one', () => {
  const plan = planArticleAds([textBlock(body(20))], noBanner)
  const runs = plan.proseRuns.get(0)
  assert.ok(runs.length > 1)
  for (const run of runs.slice(1)) {
    assert.match(run, /^<h[23][\s>]/, `run does not open a section: ${run.slice(0, 40)}`)
  }
})

test('an h4 sub-item is not a section break', () => {
  const plan = planArticleAds([textBlock(body(8, h4))], noBanner)
  assert.equal(plan.count, 0)
})

test('no ad in the tail of the article', () => {
  const plan = planArticleAds([textBlock(body(20))], noBanner)
  const runs = plan.proseRuns.get(0)
  const tail = runs[runs.length - 1].replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
  assert.ok(tail >= 250, `last ad left only ${tail} words after it`)
})

test('splitting a block preserves its content exactly', () => {
  const html = body(20)
  const plan = planArticleAds([textBlock(html)], noBanner)
  assert.equal(plan.proseRuns.get(0).join(''), html)
})

/** Two 400-word prose blocks with one block between them, and no internal
 *  section break long enough to host an ad -- so the only candidate boundary is
 *  the one in front of the middle block. */
const around = (blockType) => [
  textBlock(h2('Open') + para(400)),
  { id: 'm', blockType },
  textBlock(h2('Close') + para(400)),
]

test('an ad may open a photo but never an editorial block', () => {
  assert.equal(planArticleAds(around('image')).afterBlock.get(0), 'banner')
  assert.equal(planArticleAds(around('pull-quote')).afterBlock.get(0), undefined)
  assert.equal(planArticleAds(around('in-the-know')).afterBlock.get(0), undefined)
  assert.equal(planArticleAds(around('faq')).afterBlock.get(0), undefined)
})

test('an ad is never the last thing before the paywall', () => {
  const blocks = around('image')
  assert.equal(planArticleAds(blocks).afterBlock.get(0), 'banner')
  assert.equal(planArticleAds(blocks, { gateAt: 1 }).afterBlock.get(0), undefined)
})

test('the sample and the remainder agree on the plan', () => {
  const blocks = [textBlock(body(10)), { id: 'i', blockType: 'image' }, textBlock(body(10))]
  const gateAt = 1
  const server = planArticleAds(blocks.slice(0, gateAt), { gateAt })
  const client = planArticleAds(blocks, { gateAt })
  // The server renders block 0 only, so its runs must match the client's.
  assert.deepEqual(server.proseRuns.get(0), client.proseRuns.get(0))
  assert.equal(server.afterBlock.get(0), undefined)
  assert.equal(client.afterBlock.get(0), undefined)
})

test('disabled means no slots', () => {
  assert.equal(planArticleAds([textBlock(body(40))], { enabled: false }).count, 0)
})

// --- the opening banner ----------------------------------------------------

test('the banner follows the opening paragraph, not the headline', () => {
  const plan = planArticleAds([textBlock(h2('Lede') + para(80) + para(200) + h3() + para(300))])
  const runs = plan.proseRuns.get(0)
  const variants = plan.proseAds.get(0)
  assert.equal(variants[0], 'banner')
  assert.match(runs[0], /^<h2[\s>]/)
  assert.match(runs[0], /<\/p>$/, 'the banner must sit after a paragraph')
})

test('the banner may sit in front of a heading, but never behind one', () => {
  // A body that alternates heading and paragraph has no other boundary this
  // high up, so refusing to precede a heading would mean refusing the slot.
  const plan = planArticleAds([textBlock(para(80) + h2('A') + para(300) + h2('B') + para(300))])
  const runs = plan.proseRuns.get(0)
  assert.equal(plan.proseAds.get(0)[0], 'banner')
  assert.match(runs[0], /<\/p>$/, 'the banner sits after prose')
  assert.match(runs[1], /^<h2[\s>]/)
})

test('an unusable first candidate does not cancel the banner', () => {
  // The lede is too short; the banner takes the next boundary instead.
  const plan = planArticleAds([textBlock(h3('Open') + para(15) + para(120) + h3() + para(600))])
  assert.equal(plan.proseAds.get(0)[0], 'banner')
})

test('the opening bar is dropped rather than buried deep in the body', () => {
  // Nothing qualifies until well past the point where every reader would see
  // it, so the opening slot is given up and the section breaks cover the body.
  const plan = planArticleAds([textBlock(h2('Open') + para(600) + h3() + para(600))])
  assert.ok(firstSlotAt(plan) > 400, `opening bar buried at ${firstSlotAt(plan)} words`)
  assert.ok(plan.count > 0)
})

test('a lede too short to have been read gets no banner', () => {
  const plan = planArticleAds([textBlock(h2('Lede') + para(10) + h3() + para(600))])
  assert.equal((plan.proseAds.get(0) ?? []).includes('banner'), false)
})

test('the banner is the only ad a short article carries', () => {
  const plan = planArticleAds([textBlock(h2('Lede') + para(80) + para(200))])
  assert.equal(plan.count, 1)
  assert.deepEqual(plan.proseAds.get(0), ['banner'])
})

test('bars keep their spacing from each other', () => {
  const plan = planArticleAds([textBlock(body(20))])
  const runs = plan.proseRuns.get(0)
  assert.ok(runs.length > 2)
  for (const run of runs.slice(1, -1)) {
    const between = run.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
    assert.ok(between >= 250, `only ${between} words between bars`)
  }
})

test('the banner respects the paywall seam like any other slot', () => {
  const blocks = [textBlock(h2('Lede') + para(80)), textBlock(para(600))]
  assert.equal(planArticleAds(blocks, { gateAt: 1 }).count, 0)
})

test('banner: false drops the opening slot but keeps the rest', () => {
  const body = h2('Lede') + para(80) + para(400) + h3() + para(600)
  const withBar = planArticleAds([textBlock(body)])
  const without = planArticleAds([textBlock(body)], noBanner)
  assert.ok(firstSlotAt(withBar) < 200, `opening bar missing: ${firstSlotAt(withBar)}`)
  assert.ok(firstSlotAt(without) >= 300, `opening bar not dropped: ${firstSlotAt(without)}`)
  assert.ok(without.count < withBar.count)
})

// --- editorial blocks -------------------------------------------------------

const EDITORIAL = ['key-takeaway', 'pull-quote', 'in-the-know', 'highlight-callout', 'faq']

test('no ad of either kind is ever placed above an editorial block', () => {
  for (const blockType of EDITORIAL) {
    // The block sits where the banner would land (right after the lede) and
    // where a rectangle would land (at the section break), on the same body.
    const early = [
      textBlock(h2('Lede') + para(80)),
      { id: 'e', blockType },
      textBlock(para(300) + h3() + para(600)),
    ]
    const deep = [
      textBlock(h2('Lede') + para(80) + para(400)),
      { id: 'e', blockType },
      textBlock(para(600)),
    ]
    assert.equal(planArticleAds(early).afterBlock.get(0), undefined, blockType)
    assert.equal(planArticleAds(deep).afterBlock.get(0), undefined, blockType)
  }
})

test('no ad of either kind is ever placed below an editorial block', () => {
  for (const blockType of EDITORIAL) {
    const blocks = [
      { id: 'e', blockType },
      textBlock(h2('Lede') + para(80) + para(400) + h3() + para(600)),
    ]
    const plan = planArticleAds(blocks)
    assert.equal(plan.afterBlock.get(0), undefined, blockType)
    // Whatever it does place must be inside the prose, not at the block seam.
    assert.ok(plan.count > 0, blockType)
  }
})

test('a photo is the only block an ad may introduce', () => {
  for (const blockType of ['image', 'img-pair', 'img-trio']) {
    const blocks = [
      textBlock(h2('Lede') + para(80) + para(400)),
      { id: 'p', blockType },
      textBlock(para(600)),
    ]
    assert.equal(planArticleAds(blocks).afterBlock.get(0), 'banner', blockType)
  }
})
