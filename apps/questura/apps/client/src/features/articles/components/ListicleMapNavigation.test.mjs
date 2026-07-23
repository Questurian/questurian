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
  })

  assert.deepEqual(state, {
    activeId: 'stop-e',
    targetId: null,
  })
})
