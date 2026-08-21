import assert from 'node:assert/strict'
import test from 'node:test'
import { planListicleAds } from './listicleAdPlacement.ts'

test('one ad after the intro, then one after every second entry', () => {
  const plan = planListicleAds(10)
  assert.equal(plan.afterIntro, true)
  assert.deepEqual([...plan.afterItem].sort((a, b) => a - b), [1, 3, 5, 7])
  assert.equal(plan.count, 5)
})

test('never after the last entry', () => {
  // Item 9 closes the list, so the slot that would follow it is dropped.
  assert.equal(planListicleAds(10).afterItem.has(9), false)
  // An odd count ends on a non-slot anyway.
  assert.equal(planListicleAds(11).afterItem.has(10), false)
})

test('no intro means no opening slot', () => {
  const plan = planListicleAds(6, { hasIntro: false })
  assert.equal(plan.afterIntro, false)
  assert.deepEqual([...plan.afterItem].sort((a, b) => a - b), [1, 3])
})

test('a one-entry list gets the intro slot and nothing between', () => {
  const plan = planListicleAds(1)
  assert.equal(plan.afterIntro, true)
  assert.equal(plan.afterItem.size, 0)
})

test('an empty list gets nothing', () => {
  assert.equal(planListicleAds(0).count, 0)
})

test('the cadence is a knob', () => {
  assert.deepEqual([...planListicleAds(12, { everyNItems: 3 }).afterItem], [2, 5, 8])
  assert.deepEqual([...planListicleAds(12, { everyNItems: 4 }).afterItem], [3, 7])
})

test('disabled means no slots', () => {
  assert.equal(planListicleAds(20, { enabled: false }).count, 0)
})
