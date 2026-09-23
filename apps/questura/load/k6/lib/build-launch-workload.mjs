#!/usr/bin/env node
// The k6 workload for the launch corpus, derived from its manifest
// (surge plan L08).
//
//   node load/k6/lib/build-launch-workload.mjs
//
// Reads `load/k6/manifests/launch-v1.json` (written by
// `pnpm readiness:launch -- seed`) and writes `load/k6/workloads/launch-local.json`:
// every published page with the exact markers it must and must not contain,
// the pages that must be 404, the searches, the exact identity each session
// label must report, each reader's exact bookmark set, the gated pieces with
// their member markers, and the cold backend reads. Nothing here is a cookie:
// sessions are minted at run time (`pnpm readiness:sessions`).
//
// Deterministic: the same manifest always produces the same workload.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(here, '../manifests/launch-v1.json'), 'utf8'))
const out = resolve(here, '../workloads/launch-local.json')

const published = manifest.pieces.filter((piece) => piece.status === 'published')
const excludesFor = (piece) => (piece.markers.member ? [piece.markers.member] : [])

const pages = []
for (const city of manifest.cities) {
  pages.push({
    path: city.path,
    kind: 'landing',
    expect: { status: 200, contains: [`Reading ${city.slug}`], excludes: published.map((piece) => piece.markers.member).filter(Boolean), cacheable: true },
  })
}
for (const piece of published) {
  pages.push({
    path: piece.path,
    kind: 'article',
    type: piece.type,
    id: piece.id,
    access: piece.access,
    expect: { status: 200, contains: [piece.markers.title, piece.markers.body], excludes: excludesFor(piece), cacheable: true },
  })
}
for (const path of [...manifest.missingPaths, manifest.retired.path]) {
  pages.push({ path, kind: 'missing', expect: { status: 404 } })
}
for (const search of manifest.searches) {
  const path = `/search?q=${encodeURIComponent(search.q)}`
  const expect =
    search.expect === 'none'
      ? { status: 200, contains: ['data-search-state="empty"'], cacheable: false }
      : { status: 200, contains: search.expectedPaths && search.expectedPaths.length ? search.expectedPaths : ['results'], excludes: ['data-search-state="unavailable"'], cacheable: false }
  pages.push({ path, kind: 'search', expect })
}

const identities = { anonymous: { authenticated: false } }
const bookmarks = {}
for (const identity of manifest.identities) {
  identities[identity.label] = identity.expect.authenticated
    ? { authenticated: true, email: identity.email, member: identity.expect.member }
    : { authenticated: false }
  bookmarks[identity.label] = identity.expect.authenticated
    ? identity.bookmarks.map((ref) => `${ref.targetType}:${ref.targetId}`).sort()
    : []
}

const gated = published
  .filter((piece) => piece.access === 'member')
  .map((piece) => ({ type: piece.type, id: piece.id, path: piece.path, member: piece.markers.member }))

const cold = published.map((piece) => {
  if (piece.type === 'articles') return `/api/public/articles/by-canonical-path?path=${encodeURIComponent(piece.path)}&lang=en`
  const [, country, city] = piece.path.split('/')
  return `/api/public/articles/by-id?scope=city&country=${country}&city=${city}&slug=${piece.slug}&type=${piece.type}&lang=en`
})

const workload = {
  version: 2,
  name: `${manifest.version}-local`,
  source: 'load/k6/manifests/launch-v1.json',
  client: 'http://127.0.0.1:3100',
  backend: 'http://127.0.0.1:4100',
  origin: 'http://app.readiness.localhost:3100',
  pages,
  cold,
  gated,
  identities,
  bookmarks,
  identity: { anonymous: { authenticated: false }, signedIn: { authenticated: true } },
}

writeFileSync(out, JSON.stringify(workload, null, 2) + '\n')
console.log(`Wrote ${out}: ${pages.length} pages, ${cold.length} cold reads, ${gated.length} gated pieces, ${Object.keys(identities).length} identities.`)
