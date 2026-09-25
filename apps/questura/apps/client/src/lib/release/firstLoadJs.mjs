/**
 * First-load JavaScript per route, from the build's own manifests (launch fix
 * plan item 13).
 *
 * What a reader's browser downloads before a page is interactive: the page's
 * chunks plus the chunks of every layout, template, loading, error and
 * not-found file above it (and the root's global error). Next's own "First
 * Load JS" column counts the page entry only and leaves out the layouts'
 * client code, so it reads lower than what the browser actually fetches; this
 * counts both, each file once.
 *
 * Sizes are gzip level 9 in kB of 1,000 bytes, like Next's column. Gzip of a
 * built file is deterministic, so any machine that builds the same code gets
 * the same numbers (a GitHub runner and a Mac agreed within 0.1 kB).
 *
 * Pure apart from the `sizeOf` callback, so node:test covers it.
 */

/** `/(public)/[country]/[city]/page` → `/(public)/[country]/[city]` */
function dirOf(entry) {
  const cut = entry.lastIndexOf('/')
  return cut <= 0 ? '' : entry.slice(0, cut)
}

function isAncestorOrSelf(dir, of) {
  return dir === '' || of === dir || of.startsWith(`${dir}/`)
}

/**
 * @param {{ pages: Record<string, string[]> }} appBuildManifest `.next/app-build-manifest.json`
 * @param {Record<string, string>} appPathRoutes `.next/app-path-routes-manifest.json`
 * @param {(file: string) => number} sizeOf gzip bytes of one `static/...` file
 * @returns {Record<string, number>} route → kB, one decimal
 */
export function firstLoadJsByRoute(appBuildManifest, appPathRoutes, sizeOf) {
  const pages = appBuildManifest.pages
  const entries = Object.keys(pages)
  const cache = new Map()
  const gz = (file) => {
    if (!cache.has(file)) cache.set(file, sizeOf(file))
    return cache.get(file)
  }

  const out = {}
  for (const entry of entries) {
    if (!entry.endsWith('/page')) continue
    const route = appPathRoutes[entry]
    if (!route) continue
    const pageDir = dirOf(entry)
    const files = new Set(pages[entry])
    for (const other of entries) {
      if (other === entry || other.endsWith('/page') || other.endsWith('/route')) continue
      if (isAncestorOrSelf(dirOf(other), pageDir)) for (const file of pages[other]) files.add(file)
    }
    let bytes = 0
    for (const file of files) if (file.endsWith('.js')) bytes += gz(file)
    out[route] = Math.round(bytes / 100) / 10
  }
  return out
}

/** What a route already over the cap may still grow by: build noise, not a feature. */
export const OVER_CAP_SLACK = 0.01

const tenth = (kb) => Math.round(kb * 10) / 10

/**
 * The limit for one route:
 *  - no baseline: the cap;
 *  - baseline under the cap: baseline plus `growth`, never above the cap;
 *  - baseline already over the cap: the baseline itself (plus 1% of build
 *    noise). It may not grow at all until someone brings it under; the check
 *    names it on every run.
 */
export function limitFor(baseline, budget) {
  if (baseline === undefined) return budget.capKb
  if (baseline > budget.capKb) return tenth(baseline * (1 + OVER_CAP_SLACK))
  return Math.min(budget.capKb, tenth(baseline * (1 + budget.growth)))
}

/**
 * Each route against its limit (`limitFor`). A route with no baseline is
 * named, so the baseline gets a line for it.
 *
 * @param {Record<string, number>} measured
 * @param {{ capKb: number, growth: number, baselineKb: Record<string, number> }} budget
 */
export function checkFirstLoadJs(measured, budget) {
  const rows = []
  for (const [route, kb] of Object.entries(measured).sort(([a], [b]) => a.localeCompare(b))) {
    const baseline = budget.baselineKb[route]
    const limit = limitFor(baseline, budget)
    rows.push({ route, kb, baseline, limit, ok: kb <= limit, overCap: kb > budget.capKb })
  }
  const gone = Object.keys(budget.baselineKb).filter((route) => !(route in measured))
  return {
    rows,
    failed: rows.filter((row) => !row.ok),
    overCap: rows.filter((row) => row.ok && row.overCap),
    unbaselined: rows.filter((row) => row.baseline === undefined),
    gone,
  }
}
