import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialListicleMapNavigationState,
  listicleMapNavigationReducer,
} from './ListicleMapNavigation.ts'

test('observer cannot hijack a marker-driven navigation', () => {
  let state = listicleMapNavigationReducer(initialListicleMapNavigationState, {
    type: 'navigate',
    id: 'stop-d',
  })

  state = listicleMapNavigationReducer(state, {
    type: 'observe',
    id: 'stop-b',
    aboveList: false,
  })

  assert.deepEqual(state, {
    activeId: 'stop-d',
    targetId: 'stop-d',
  })
})

test('only the current target can release the navigation lock', () => {
  let state = listicleMapNavigationReducer(initialListicleMapNavigationState, {
    type: 'navigate',
    id: 'stop-d',
  })
  state = listicleMapNavigationReducer(state, {
    type: 'navigate',
    id: 'stop-e',
  })
  state = listicleMapNavigationReducer(state, {
    type: 'release',
    targetId: 'stop-d',
    observedId: 'stop-d',
  })

  assert.deepEqual(state, {
    activeId: 'stop-e',
    targetId: 'stop-e',
  })
})

test('observer resumes after the target releases the navigation lock', () => {
  let state = listicleMapNavigationReducer(initialListicleMapNavigationState, {
    type: 'navigate',
    id: 'stop-d',
  })
  state = listicleMapNavigationReducer(state, {
    type: 'release',
    targetId: 'stop-d',
    observedId: 'stop-d',
  })
  state = listicleMapNavigationReducer(state, {
    type: 'observe',
    id: 'stop-e',
    aboveList: false,
  })

  assert.deepEqual(state, {
    activeId: 'stop-e',
    targetId: null,
  })
})

test('an ad between entries does not release the map to the overview', () => {
  let state = listicleMapNavigationReducer(initialListicleMapNavigationState, {
    type: 'observe',
    id: 'stop-c',
    aboveList: false,
  })

  // The reader scrolls an ad slot through the band: nothing is observed, but
  // the map must stay on the stop they were just reading.
  state = listicleMapNavigationReducer(state, {
    type: 'observe',
    id: null,
    aboveList: false,
  })

  assert.deepEqual(state, { activeId: 'stop-c', targetId: null })
})

test('scrolling back above the first entry does release the overview', () => {
  let state = listicleMapNavigationReducer(initialListicleMapNavigationState, {
    type: 'observe',
    id: 'stop-a',
    aboveList: false,
  })
  state = listicleMapNavigationReducer(state, {
    type: 'observe',
    id: null,
    aboveList: true,
  })

  assert.deepEqual(state, { activeId: null, targetId: null })
})
