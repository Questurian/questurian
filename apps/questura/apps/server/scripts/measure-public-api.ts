/**
 * Measure the public API the way the audit measured it, but repeatably.
 *
 * The audit's own numbers came from three sequential curls per endpoint, which
 * it said plainly could not establish a p95. This takes as many samples as you
 * ask for, separates the first (compiling, cold caches) from the rest, and
 * reports the distribution rather than the fastest run.
 *
 * It also reads `Server-Timing`, so every row carries what the request
 * actually *did* — SQL statements, document reads, peak concurrency — next to
 * how long it took. Timings are a property of the machine; counts are a
 * property of the code, and they are the numbers worth comparing across
 * machines.
 *
 * Needs `PUBLIC_API_DIAGNOSTICS=1` on the server, or it sends the
 * `x-questura-diagnostics` header, which the server accepts outside production.
 *
 * Usage:
 *   pnpm measure:api
 *   pnpm measure:api -- --runs 20 --base https://api.questurian.com
 *   pnpm measure:api -- --concurrent 4
 *   pnpm measure:api -- --json /tmp/api.json --html /tmp/api.html
 */

import { writeFileSync } from 'node:fs'

type Target = { name: string; path: string }

const TARGETS: Target[] = [
  { name: 'city homepage', path: '/api/public/location-homepages/peru/lima' },
  { name: 'search', path: '/api/public/articles/search?q=lima' },
  {
    name: 'location feed',
    path: '/api/public/articles/by-location?key=peru%7Clima&page=1&pageSize=20',
  },
  {
    name: 'article index',
    path: '/api/public/articles/index?scope=global&type=articles&pageSize=20',
  },
  { name: 'navigation menu', path: '/api/public/locations/menu' },
]

type Sample = {
  ms: number
  status: number
  bytes: number
  statements: number | null
  reads: number | null
  peak: string | null
  coalesced: string | null
  cacheControl: string | null
}

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

/** `total;dur=954, sql;dur=5438;desc="382 statements (cumulative)", reads;desc="43"` */
function parseServerTiming(header: string | null): Record<string, string> {
  if (!header) return {}

  const entries: Record<string, string> = {}
  // Split on commas outside quotes. A quoted comma is legal in this header and
  // splitting on it blindly silently drops the entry it was in.
  const parts = header.match(/(?:[^,"]|"[^"]*")+/g) ?? []

  for (const part of parts) {
    const name = part.trim().split(';')[0]?.trim()
    if (!name) continue

    const description = /desc="([^"]*)"/.exec(part)?.[1]
    const duration = /dur=([\d.]+)/.exec(part)?.[1]
    entries[name] = description ?? duration ?? ''
  }
  return entries
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)]!
}

async function sample(url: string): Promise<Sample> {
  const startedAt = performance.now()
  const response = await fetch(url, { headers: { 'x-questura-diagnostics': '1' } })
  const body = await response.arrayBuffer()
  const ms = performance.now() - startedAt

  const timing = parseServerTiming(response.headers.get('server-timing'))
  const statements = /^(\d+) statements/.exec(timing.sql ?? '')?.[1]

  return {
    ms,
    status: response.status,
    bytes: body.byteLength,
    statements: statements ? Number(statements) : null,
    reads: timing.reads ? Number(timing.reads) : null,
    peak: timing.peak ?? null,
    coalesced: timing.coalesced ?? null,
    cacheControl: response.headers.get('cache-control'),
  }
}

type Row = {
  target: Target
  cold: Sample | null
  warm: Sample[]
  p50: number
  p95: number
  p99: number
  min: number
  max: number
}

function summarize(target: Target, samples: Sample[]): Row {
  // The first request compiles routes and warms caches. Reporting it inside
  // the distribution is how a p95 ends up describing a compile.
  const [cold, ...warm] = samples
  const sorted = warm.map((entry) => entry.ms).sort((a, b) => a - b)

  return {
    target,
    cold: cold ?? null,
    warm,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function printTable(rows: Row[], concurrency: number) {
  const header =
    'endpoint'.padEnd(18) +
    'n'.padStart(4) +
    'cold'.padStart(9) +
    'p50'.padStart(9) +
    'p95'.padStart(9) +
    'p99'.padStart(9) +
    'stmts'.padStart(8) +
    'reads'.padStart(7) +
    'bytes'.padStart(9)
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const row of rows) {
    const last = row.warm[row.warm.length - 1]
    console.log(
      row.target.name.padEnd(18) +
        String(row.warm.length).padStart(4) +
        `${round(row.cold?.ms ?? 0)}`.padStart(9) +
        `${round(row.p50)}`.padStart(9) +
        `${round(row.p95)}`.padStart(9) +
        `${round(row.p99)}`.padStart(9) +
        `${last?.statements ?? '-'}`.padStart(8) +
        `${last?.reads ?? '-'}`.padStart(7) +
        `${last?.bytes ?? '-'}`.padStart(9),
    )
  }

  console.log()
  console.log('Milliseconds are wall time on this machine against this data, and travel')
  console.log('nowhere. Statement and read counts are properties of the code and do.')
  if (concurrency > 1) console.log(`Each sample fired ${concurrency} requests at once.`)
}

function htmlReport(rows: Row[], meta: Record<string, string | number>): string {
  const cells = rows
    .map((row) => {
      const last = row.warm[row.warm.length - 1]
      return `<tr>
        <td>${row.target.name}</td>
        <td class="n">${round(row.cold?.ms ?? 0)}</td>
        <td class="n">${round(row.p50)}</td>
        <td class="n">${round(row.p95)}</td>
        <td class="n">${round(row.p99)}</td>
        <td class="n">${last?.statements ?? '—'}</td>
        <td class="n">${last?.reads ?? '—'}</td>
        <td class="n">${last?.bytes ?? '—'}</td>
        <td><code>${last?.cacheControl ?? '—'}</code></td>
      </tr>`
    })
    .join('\n')

  const metaRows = Object.entries(meta)
    .map(([key, value]) => `<tr><td>${key}</td><td><code>${value}</code></td></tr>`)
    .join('\n')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Questura public API measurement</title>
<style>
  :root { color-scheme: light dark; --ink:#1a1a1a; --paper:#fff; --rule:#d8d8d8; --dim:#666; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#e8e8e8; --paper:#151515; --rule:#333; --dim:#999; }
  }
  body { font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; color: var(--ink);
         background: var(--paper); margin: 0; padding: 32px 16px; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  p.sub { color: var(--dim); margin: 0 0 28px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 28px; font-size: 14px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--rule); }
  th { font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-size: 12px; }
  .note { color: var(--dim); font-size: 13px; }
</style></head>
<body><main>
<h1>Questura public API measurement</h1>
<p class="sub">${meta.takenAt}</p>
<table>
  <thead><tr>
    <th>endpoint</th><th class="n">cold ms</th><th class="n">p50</th><th class="n">p95</th>
    <th class="n">p99</th><th class="n">statements</th><th class="n">reads</th>
    <th class="n">bytes</th><th>cache-control</th>
  </tr></thead>
  <tbody>${cells}</tbody>
</table>
<h2 style="font-size:1rem">Run</h2>
<table><tbody>${metaRows}</tbody></table>
<p class="note">Milliseconds are wall time on the machine that ran this, against the data
it had, and travel nowhere else. Statement and read counts are properties of the code and
do. The cold column is the first request of each endpoint, held out of the distribution so
a p95 does not end up describing a compile.</p>
</main></body></html>`
}

async function main() {
  const base = flag('base', 'http://localhost:4000').replace(/\/+$/, '')
  const runs = Math.max(2, Number(flag('runs', '10')))
  const concurrency = Math.max(1, Number(flag('concurrent', '1')))
  const jsonPath = flag('json', '')
  const htmlPath = flag('html', '')

  const rows: Row[] = []

  for (const target of TARGETS) {
    const url = `${base}${target.path}`
    const samples: Sample[] = []

    for (let run = 0; run < runs; run += 1) {
      if (concurrency === 1) {
        samples.push(await sample(url))
      } else {
        const batch = await Promise.all(
          Array.from({ length: concurrency }, () => sample(url)),
        )
        samples.push(...batch)
      }
    }

    rows.push(summarize(target, samples))
  }

  printTable(rows, concurrency)

  const meta = {
    takenAt: new Date().toISOString(),
    base,
    runs,
    concurrency,
    node: process.version,
  }

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ meta, rows }, null, 2))
    console.log(`\nJSON: ${jsonPath}`)
  }

  if (htmlPath) {
    writeFileSync(htmlPath, htmlReport(rows, meta))
    console.log(`HTML: ${htmlPath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
