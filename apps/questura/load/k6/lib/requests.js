import http from 'k6/http'
import { check } from 'k6'

import { BASE_URL, CLIENT_URL, ORIGIN } from './config.js'

// Each request is tagged `kind` so the gates can hold pages and dynamic reads
// to different latency budgets, and `name` so the URL mix does not explode
// the metric cardinality.

export function page(path, name = 'page') {
  const response = http.get(`${CLIENT_URL}${path}`, { tags: { kind: 'page', name }, redirects: 0 })
  check(response, {
    'page answered 200/307/308': (r) => [200, 307, 308].includes(r.status),
    'page is HTML': (r) => r.status !== 200 || (r.body || '').includes('<html'),
  })
  return response
}

export function identity(cookie) {
  const headers = { Origin: ORIGIN }
  if (cookie) headers.Cookie = cookie
  const response = http.get(`${BASE_URL}/api/me`, { headers, tags: { kind: 'dynamic', name: 'identity' } })
  check(response, {
    'identity answered': (r) => r.status === 200,
    'identity is JSON': (r) => {
      try {
        return typeof r.json('authenticated') === 'boolean'
      } catch {
        return false
      }
    },
  })
  return response
}

export function api(path, name) {
  const response = http.get(`${BASE_URL}${path}`, { tags: { kind: 'dynamic', name } })
  check(response, { [`${name} answered 200`]: (r) => r.status === 200 })
  return response
}
