import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./EditorialFeaturePreview.tsx', import.meta.url),
  'utf8'
)

test('editorial feature reserves full-width divider rules for tablet and desktop', () => {
  assert.doesNotMatch(source, /justify-center border-y /)
  assert.match(source, /justify-center border-foreground\/30[^"`]*768:border-y/)

  assert.doesNotMatch(source, /gap-4 border-t /)
  assert.match(source, /gap-4 border-foreground\/70[^"`]*768:border-t/)
  assert.match(source, /768:pt-6/)
})
