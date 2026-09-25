import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_VITALS_BATCHES, WEB_VITALS_PATH, createVitalsBatcher, vitalsUrl } from './webVitals.ts'

// Launch fix plan item 13: real readers' LCP, INP and CLS reach the API's
// beacon, one small cookie-less batch per page view.

function recorder() {
  const calls = []
  return { calls, fetch: (url, init) => (calls.push({ url, init, body: JSON.parse(init.body) }), Promise.resolve()) }
}

test('vitalsUrl joins the backend and the beacon path', () => {
  assert.equal(vitalsUrl('https://api.questurian.com/'), `https://api.questurian.com${WEB_VITALS_PATH}`)
})

test('one batch per flush, latest value per metric, only the metrics the API takes', () => {
  const { calls, fetch } = recorder()
  const batcher = createVitalsBatcher({ backendUrl: 'https://api.example', path: '/peru/lima?utm=x#top', release: 'abc123', fetch })

  batcher.add({ name: 'TTFB', value: 120, rating: 'good', navigationType: 'navigate' })
  batcher.add({ name: 'CLS', value: 0.01, rating: 'good' })
  batcher.add({ name: 'CLS', value: 0.04, rating: 'good' })
  batcher.add({ name: 'FID', value: 3, rating: 'good' })
  batcher.add({ name: 'LCP', value: Number.NaN })
  assert.equal(batcher.flush(), true)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.example/api/web-vitals')
  assert.deepEqual(calls[0].body, {
    path: '/peru/lima',
    navigationType: 'navigate',
    release: 'abc123',
    metrics: [
      { name: 'TTFB', value: 120, rating: 'good' },
      { name: 'CLS', value: 0.04, rating: 'good' },
    ],
  })
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[0].init.keepalive, true)
  assert.match(calls[0].init.headers['content-type'], /^text\/plain/)
})

test('nothing pending, nothing sent; a later metric makes a second batch', () => {
  const { calls, fetch } = recorder()
  const batcher = createVitalsBatcher({ backendUrl: 'https://api.example', path: '/join', fetch })
  assert.equal(batcher.flush(), false)
  batcher.add({ name: 'LCP', value: 900 })
  batcher.flush()
  batcher.add({ name: 'INP', value: 40 })
  batcher.flush()
  assert.deepEqual(calls.map((call) => call.body.metrics.map((m) => m.name)), [['LCP'], ['INP']])
})

test('stops after the batch cap and never throws', () => {
  const { calls, fetch } = recorder()
  const batcher = createVitalsBatcher({ backendUrl: 'https://api.example', path: '/join', fetch })
  for (let i = 0; i < MAX_VITALS_BATCHES + 3; i++) {
    batcher.add({ name: 'INP', value: i })
    batcher.flush()
  }
  assert.equal(calls.length, MAX_VITALS_BATCHES)

  const throwing = createVitalsBatcher({ backendUrl: 'https://api.example', path: '/join', fetch: () => { throw new Error('offline') } })
  throwing.add({ name: 'LCP', value: 1 })
  assert.equal(throwing.flush(), false)
})

test('a path that is not a pathname sends nothing', () => {
  const { calls, fetch } = recorder()
  const batcher = createVitalsBatcher({ backendUrl: 'https://api.example', path: '//evil.example/x', fetch })
  batcher.add({ name: 'LCP', value: 1 })
  assert.equal(batcher.flush(), false)
  assert.equal(calls.length, 0)
})
