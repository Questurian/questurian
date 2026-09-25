#!/usr/bin/env node
/**
 * node scripts/check-first-load-js.mjs [--update]
 *
 * Fails when any route's first-load JavaScript (gzip) grows more than the
 * allowed share over its committed baseline, or passes the per-route cap
 * (launch fix plan item 13). Budgets: apps/questura/perf/budgets.json,
 * `firstLoadJs`. How it counts: src/lib/release/firstLoadJs.mjs.
 *
 * Reads `<NEXT_DIST_DIR or .next>`, so run it after a build. `--update`
 * rewrites the baseline from this build; commit that only for a change that is
 * meant to add JavaScript, and say why in the PR. A route over the cap is
 * held at its baseline and named on every run (see `limitFor`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, gzipSync } from 'node:zlib'

import { checkFirstLoadJs, firstLoadJsByRoute } from '../src/lib/release/firstLoadJs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUDGETS = resolve(HERE, '../../../perf/budgets.json')
const dist = resolve(HERE, '..', process.env.NEXT_DIST_DIR || '.next')
const update = process.argv.includes('--update')

const read = (file) => JSON.parse(readFileSync(join(dist, file), 'utf8'))
let manifest
let routes
try {
  manifest = read('app-build-manifest.json')
  routes = read('app-path-routes-manifest.json')
} catch {
  console.error(`No build in ${dist}. Build first (pnpm build, or the readiness stack's --build).`)
  process.exit(1)
}

const measured = firstLoadJsByRoute(manifest, routes, (file) =>
  gzipSync(readFileSync(join(dist, file)), { level: constants.Z_BEST_COMPRESSION }).length,
)
const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8'))

if (update) {
  budgets.firstLoadJs.baselineKb = Object.fromEntries(Object.entries(measured).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BUDGETS, `${JSON.stringify(budgets, null, 2)}\n`)
  console.log(`Baseline rewritten for ${Object.keys(measured).length} routes in ${BUDGETS}.`)
}

const { rows, failed, overCap, unbaselined, gone } = checkFirstLoadJs(measured, budgets.firstLoadJs)
const width = Math.max(...rows.map((row) => row.route.length))
for (const row of rows) {
  const base = row.baseline === undefined ? 'no baseline' : `baseline ${row.baseline.toFixed(1)}`
  const mark = !row.ok ? ' FAIL ' : row.overCap ? ' OVER ' : '  ok  '
  console.log(`${mark} ${row.route.padEnd(width)}  ${row.kb.toFixed(1).padStart(6)} kB  (limit ${row.limit.toFixed(1)}, ${base})`)
}
for (const route of gone) console.log(`  --   ${route} is in the baseline but not in this build`)
if (unbaselined.length > 0 && !update) {
  console.log(`\n${unbaselined.length} route(s) have no baseline and are held to the ${budgets.firstLoadJs.capKb} kB cap alone. Add them: node scripts/check-first-load-js.mjs --update`)
}
if (overCap.length > 0) {
  console.log(
    `\n${overCap.length} route(s) are over the ${budgets.firstLoadJs.capKb} kB cap already. They pass only while they do not grow; bring them under: ${overCap.map((row) => row.route).join(', ')}`,
  )
}
if (failed.length > 0) {
  console.error(
    `\n${failed.length} route(s) over their first-load JS budget (baseline + ${budgets.firstLoadJs.growth * 100}%, at most ${budgets.firstLoadJs.capKb} kB gzip).` +
      '\nFind what grew (a new import in a client component, a library pulled into a layout) and load it lazily or drop it.',
  )
  process.exit(1)
}
console.log(`\nFirst-load JS: ${rows.length} routes within budget.`)
