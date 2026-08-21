import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hiddenBelowFold,
  sheetHeightPx,
  translateForVisibleHeight,
  visibleHeightForMode,
} from './ListicleMapModes.ts'

const VIEWPORT = 800

test('list hides the sheet, map fills the viewport', () => {
  assert.equal(visibleHeightForMode('list', VIEWPORT), 0)
  assert.equal(visibleHeightForMode('split', VIEWPORT), 416)
  assert.equal(visibleHeightForMode('map', VIEWPORT), VIEWPORT)
})

test('the sheet never resizes - only its offset changes', () => {
  for (const mode of ['list', 'split', 'map']) {
    const visible = visibleHeightForMode(mode, VIEWPORT)
    assert.equal(
      translateForVisibleHeight(visible, VIEWPORT) + visible,
      sheetHeightPx(VIEWPORT),
    )
  }
})

test('list parks the whole sheet below the fold', () => {
  assert.equal(
    translateForVisibleHeight(visibleHeightForMode('list', VIEWPORT), VIEWPORT),
    VIEWPORT,
  )
})

test('the takeover hides nothing; split hides the rest', () => {
  assert.equal(hiddenBelowFold(visibleHeightForMode('map', VIEWPORT), VIEWPORT), 0)
  assert.equal(hiddenBelowFold(visibleHeightForMode('split', VIEWPORT), VIEWPORT), 384)
})
