import assert from 'node:assert/strict'
import test from 'node:test'

import { readPublicResponse } from './readPublicResponse.ts'

const json = (status, body = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('a 404 means the page does not exist', async () => {
  assert.equal(await readPublicResponse(json(404), 'x'), null)
})

// The backend refuses a key that is not a location key (`/evil.com`) with a
// 400. That is decided by the URL alone, so it is "no such page", not a 500.
test('a 400 means the slug is not a page', async () => {
  assert.equal(await readPublicResponse(json(400, { message: 'key must be a location key' }), 'x'), null)
})

test('a 200 is the content', async () => {
  assert.deepEqual(await readPublicResponse(json(200, { a: 1 }), 'x'), { a: 1 })
})

// Returning null here rendered a city as its fallback list, or as a 404,
// and ISR cached it for an hour. A failure must fail the render.
for (const status of [401, 403, 429, 500, 502, 503, 504]) {
  test(`a ${status} is an error, never "no such page"`, async () => {
    await assert.rejects(() => readPublicResponse(json(status), 'city homepage'), /city homepage: \d{3}/)
  })
}
