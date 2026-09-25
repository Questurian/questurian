import assert from 'node:assert/strict'
import test from 'node:test'

import { checkFirstLoadJs, firstLoadJsByRoute, limitFor } from './firstLoadJs.mjs'

// Launch fix plan item 13: first-load JS per route is what the browser
// fetches (the page and every layout above it), held to a committed baseline.

const manifest = {
  pages: {
    '/layout': ['static/chunks/main.js', 'static/css/root.css'],
    '/global-error': ['static/chunks/main.js', 'static/chunks/global-error.js'],
    '/(public)/layout': ['static/chunks/main.js', 'static/chunks/public-layout.js'],
    '/(public)/[city]/page': ['static/chunks/main.js', 'static/chunks/city.js'],
    '/(public)/[city]/[slug]/loading': ['static/chunks/loading.js'],
    '/(public)/[city]/[slug]/page': ['static/chunks/main.js', 'static/chunks/article.js'],
    '/(private)/layout': ['static/chunks/private-layout.js'],
    '/join/page': ['static/chunks/main.js', 'static/chunks/join.js'],
    '/api/health/route': ['static/chunks/route-only.js'],
  },
}
const routes = {
  '/(public)/[city]/page': '/[city]',
  '/(public)/[city]/[slug]/page': '/[city]/[slug]',
  '/join/page': '/join',
  '/api/health/route': '/api/health',
}
const sizes = {
  'static/chunks/main.js': 100_000,
  'static/chunks/global-error.js': 1_000,
  'static/chunks/public-layout.js': 20_000,
  'static/chunks/city.js': 5_000,
  'static/chunks/loading.js': 500,
  'static/chunks/article.js': 7_000,
  'static/chunks/private-layout.js': 90_000,
  'static/chunks/join.js': 3_000,
  'static/chunks/route-only.js': 50_000,
}

test('a route counts its page, every layout above it and the root, each file once, JS only', () => {
  const measured = firstLoadJsByRoute(manifest, routes, (file) => sizes[file])
  assert.deepEqual(measured, {
    '/[city]': 126, // main + global-error + public layout + city
    '/[city]/[slug]': 128.5, // + the loading file in its own folder, the article, not the city page
    '/join': 104, // no (public) layout, no (private) layout
  })
})

test('limits: baseline + growth under the cap, the cap without a baseline, no growth once over it', () => {
  const budget = { capKb: 170, growth: 0.1, baselineKb: {} }
  assert.equal(limitFor(100, budget), 110)
  assert.equal(limitFor(160, budget), 170)
  assert.equal(limitFor(undefined, budget), 170)
  assert.equal(limitFor(190, budget), 191.9)
})

test('checkFirstLoadJs fails growth, names over-cap and unbaselined routes', () => {
  const result = checkFirstLoadJs(
    { '/a': 111, '/b': 180, '/c': 120, '/new': 100 },
    { capKb: 170, growth: 0.1, baselineKb: { '/a': 100, '/b': 180, '/c': 120, '/gone': 50 } },
  )
  assert.deepEqual(result.failed.map((row) => row.route), ['/a'])
  assert.deepEqual(result.overCap.map((row) => row.route), ['/b'])
  assert.deepEqual(result.unbaselined.map((row) => row.route), ['/new'])
  assert.deepEqual(result.gone, ['/gone'])
})
