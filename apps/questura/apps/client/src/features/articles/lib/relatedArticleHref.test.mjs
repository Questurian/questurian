import assert from 'node:assert/strict'
import test from 'node:test'
import { relatedArticleHref } from './relatedArticleHref.ts'

const itinerary = { id: 1, title: 't', slug: 'two-days-lima', routeType: 'itinerary' }
const maps = { id: 2, title: 't', slug: 'best-brunch', routeType: 'maps' }

test('itinerary links use the plural route segment', () => {
  assert.equal(
    relatedArticleHref(itinerary, 'peru', 'lima'),
    '/peru/lima/itineraries/two-days-lima',
  )
  assert.equal(relatedArticleHref(itinerary, 'peru'), '/peru/itineraries/two-days-lima')
})

test('maps links keep their segment', () => {
  assert.equal(relatedArticleHref(maps, 'peru', 'lima'), '/peru/lima/maps/best-brunch')
  assert.equal(relatedArticleHref(maps, 'peru', null), '/peru/maps/best-brunch')
})
