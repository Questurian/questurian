import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPriceTier,
  plainTextExcerpt,
} from './listicleVenueFormatters.ts'

test('price tiers render as ticks, and ticks pass through', () => {
  assert.equal(formatPriceTier('3'), '$$$')
  assert.equal(formatPriceTier('$$'), '$$')
  assert.equal(formatPriceTier('0'), '')
  assert.equal(formatPriceTier(3), '')
})

test('markup is stripped and whitespace collapsed', () => {
  assert.equal(
    plainTextExcerpt('<p>Great <strong>brunch</strong></p>\n<p>and coffee</p>'),
    'Great brunch and coffee',
  )
})

test('entities are decoded, not left raw', () => {
  assert.equal(plainTextExcerpt('<p>Bar &amp; grill &#39;til late</p>'), "Bar & grill 'til late")
})

test('non-strings are empty, never "undefined"', () => {
  assert.equal(plainTextExcerpt(null), '')
  assert.equal(plainTextExcerpt(undefined), '')
  assert.equal(plainTextExcerpt(42), '')
})

test('long copy is clipped on a word boundary with an ellipsis', () => {
  const excerpt = plainTextExcerpt('one two three four five six seven eight', 20)
  assert.ok(excerpt.endsWith('...'))
  assert.ok(excerpt.length <= 23)
  assert.ok(!excerpt.includes('  '))
  assert.ok('one two three four five six seven eight'.startsWith(excerpt.slice(0, -3)))
})

test('short copy is returned whole, with no ellipsis', () => {
  assert.equal(plainTextExcerpt('Short and sweet', 160), 'Short and sweet')
})
