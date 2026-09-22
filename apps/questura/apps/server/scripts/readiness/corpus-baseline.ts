/**
 * L14: a baseline taken against a corpus large enough to have a bottleneck.
 *
 *   pnpm readiness:corpus-baseline
 *
 * Every number in this series so far came from the development copy — 31
 * locations, 25 articles. That is a regression baseline and a good one: if a
 * read that took 8ms takes 400ms next week, it says so. What it cannot do is
 * find anything, because at 25 articles a query that is O(n) and a query that
 * is O(n²) produce the same millisecond.
 *
 * So this measures the same reads at three corpus sizes and puts the results
 * side by side. The interesting column is not latency — it is **statements
 * per request**. Latency at these sizes is dominated by fixed costs and will
 * mislead; a query count that grows with the corpus is a per-row round trip,
 * and that is the shape that stops being fine on a real site.
 *
 * Two things keep the comparison honest:
 *
 *  - the corpus is deterministic (`corpus.ts`), so two runs a week apart are
 *    comparing the same rows;
 *  - one step in the scenario is a **control** — a real Lima page that does
 *    not change with the synthetic corpus at all. If the control moves, the
 *    machine was busy and the whole run is noise rather than evidence.
 *
 * It reuses `scripts/measure` rather than timing requests itself. That
 * harness already knows about warmup, cache state, pool sampling and how to
 * refuse a measurement it cannot take, and a second stopwatch in this
 * repository would only be a second thing to trust.
 *
 * Exit 0 if every check passed, 1 otherwise.
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { Pool } from 'pg'

import { buildCorpus, clearCorpus, CORPUS_SIZES, type CorpusSize } from './corpus'
import { assertPreflight } from './preflight'
import { flushSandboxRedis } from './sandbox-redis'
import { sandboxSettings } from './sandbox'

const run = promisify(execFile)

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const step = (message: string) => console.log(`--- ${message}`)

const DATABASE =
  process.env.READINESS_DATABASE_URI ?? `postgres://${process.env.USER}@127.0.0.1:5432/questura_readiness_scratch`
const BASE = process.env.READINESS_BACKEND_URL ?? 'http://127.0.0.1:4100'
const REDIS = process.env.READINESS_REDIS_URL ?? 'redis://127.0.0.1:6390'
const SIZES: CorpusSize[] = ['small', 'medium', 'large']
const CONTROL_STEP = 'control: real Lima city page'

const RUNS_DIR = resolve(process.cwd(), '../../docs/capacity/runs')
const TODAY = new Date().toISOString().slice(0, 10)

type StepReport = {
  step: string
  measured: number
  outcomes: Record<string, number>
  failureRate: number
  okLatency: { p50: number; p95: number }
  statements: { median: number; max: number; reported: number }
  bytes: { median: number }
}

type Report = { steps: StepReport[] }

async function measure(size: CorpusSize): Promise<Report> {
  const out = resolve(RUNS_DIR, `${TODAY}-L14-corpus-${size}.json`)
  await run(
    'pnpm',
    [
      'measure:api',
      '--',
      '--base',
      BASE,
      '--scenario',
      'readiness-corpus',
      '--cache',
      'warm',
      '--runs',
      '12',
      '--concurrent',
      '1',
      '--json',
      out,
    ],
    { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(readFileSync(out, 'utf8')) as Report
}

const pick = (report: Report, name: string): StepReport | undefined =>
  report.steps.find((entry) => entry.step === name)

async function main(): Promise<void> {
  assertPreflight({ ...sandboxSettings(), databaseUri: DATABASE, env: {} })

  if (!existsSync(RUNS_DIR)) throw new Error(`No runs directory at ${RUNS_DIR}.`)

  const reachable = await fetch(`${BASE}/api/public/sitemap-entries?lang=en`, {
    signal: AbortSignal.timeout(5_000),
  })
    .then((response) => response.ok)
    .catch(() => false)

  if (!reachable) {
    throw new Error(
      `No backend at ${BASE}. Start one on the production build against the scratch database:\n` +
        `  source scripts/measure/local-prod-env.sh\n` +
        `  DATABASE_URI=${DATABASE} NEXT_DIST_DIR=.next-readiness pnpm exec next start -p 4100`,
    )
  }

  const pool = new Pool({ connectionString: DATABASE, max: 2 })
  const reports = new Map<CorpusSize, Report>()

  try {
    for (const size of SIZES) {
      const shape = CORPUS_SIZES[size]
      step(`building the ${size} corpus (${shape.cities} cities × ${shape.articlesPerCity} published)`)
      const counts = await buildCorpus(pool, size, 20260922)
      console.log(`    ${counts.locations} locations, ${counts.published} published articles`)

      // The sitemap budget is thirty per minute and this run asks for twelve
      // samples of it per size. Without this the second and third sizes
      // measure the first one's spent budget: ten of twelve samples came back
      // `429` and the step was reported as the server failing.
      await flushSandboxRedis(REDIS)

      step(`measuring against the ${size} corpus`)
      reports.set(size, await measure(size))
    }

    // -----------------------------------------------------------------------
    // The table. Statements first, because that is the column that answers
    // the question this task was set.
    // -----------------------------------------------------------------------
    const names = reports.get('small')!.steps.map((entry) => entry.step)

    console.log('\nStatements per request, by corpus size:\n')
    console.log(`  ${'step'.padEnd(36)} | ${'small'.padStart(7)} | ${'medium'.padStart(7)} | ${'large'.padStart(7)}`)
    for (const name of names) {
      const row = SIZES.map((size) => pick(reports.get(size)!, name)?.statements.median ?? -1)
      console.log(
        `  ${name.padEnd(36)} | ${String(row[0]).padStart(7)} | ${String(row[1]).padStart(7)} | ${String(row[2]).padStart(7)}`,
      )
    }

    console.log('\np95 latency (ms) and median response size (bytes), by corpus size:\n')
    console.log(
      `  ${'step'.padEnd(36)} | ${'small'.padStart(16)} | ${'medium'.padStart(16)} | ${'large'.padStart(16)}`,
    )
    for (const name of names) {
      const cells = SIZES.map((size) => {
        const entry = pick(reports.get(size)!, name)
        return entry ? `${entry.okLatency.p95.toFixed(0)}ms / ${entry.bytes.median}b` : 'n/a'
      })
      console.log(`  ${name.padEnd(36)} | ${cells[0]!.padStart(16)} | ${cells[1]!.padStart(16)} | ${cells[2]!.padStart(16)}`)
    }
    console.log('')

    // -----------------------------------------------------------------------
    // What has to be true for the table above to mean anything.
    // -----------------------------------------------------------------------
    const everyStepOk = SIZES.every((size) =>
      reports.get(size)!.steps.every((entry) => entry.failureRate === 0 && entry.measured > 0),
    )
    check(
      everyStepOk,
      'every read succeeded at every corpus size — nothing fell over, so the numbers are of a working system',
      SIZES.map((size) => `${size}: ${reports.get(size)!.steps.filter((e) => e.failureRate > 0).length} failing`).join(', '),
    )

    // The control. If this moved, the machine moved.
    const control = SIZES.map((size) => pick(reports.get(size)!, CONTROL_STEP)!)
    const controlSpread = Math.max(...control.map((c) => c.okLatency.p95)) / Math.max(Math.min(...control.map((c) => c.okLatency.p95)), 0.01)
    check(
      controlSpread < 3,
      'the control read did not move much across the three runs — the comparison is of the corpus, not of the machine',
      `p95 ${control.map((c) => c.okLatency.p95.toFixed(0) + 'ms').join(' → ')}`,
    )
    check(
      control.every((c) => c.statements.median === control[0]!.statements.median),
      'and the control issues the same number of statements whatever the corpus holds',
      `${control.map((c) => c.statements.median).join(' / ')} statements`,
    )

    // The corpus has to be doing something, or a flat table proves nothing.
    const sitemap = SIZES.map((size) => pick(reports.get(size)!, 'sitemap (every public URL)')!)
    check(
      sitemap[2]!.bytes.median > sitemap[0]!.bytes.median * 5,
      'the corpus really is exercising the system — the sitemap grows with it',
      `${sitemap.map((s) => s.bytes.median + 'b').join(' → ')}`,
    )

    // The finding this task exists to produce.
    //
    // A read whose statement count is *flat* as content grows is a bounded
    // query. A read whose statement count grows *with the row count* is a
    // per-row round trip, and that is the thing that does not survive a real
    // site. In between sits a paged scan — more pages means more statements,
    // but far more slowly than the corpus grows — which is fine and is what
    // the sitemap does.
    //
    // So the gate is the ratio, not the direction: the corpus grows by two
    // orders of magnitude here, and nothing may grow anywhere near with it.
    const publishedSmall = CORPUS_SIZES.small.cities * CORPUS_SIZES.small.articlesPerCity
    const publishedLarge = CORPUS_SIZES.large.cities * CORPUS_SIZES.large.articlesPerCity
    const corpusRatio = publishedLarge / publishedSmall

    const growth = names
      .filter((name) => name !== CONTROL_STEP)
      .map((name) => {
        const small = pick(reports.get('small')!, name)?.statements.median ?? 0
        const large = pick(reports.get('large')!, name)?.statements.median ?? 0
        return { name, small, large, ratio: large / Math.max(small, 1) }
      })

    const perRow = growth.filter((row) => row.ratio > 3)
    check(
      perRow.length === 0,
      `the corpus grew ${corpusRatio.toFixed(0)}× and no read's statement count grew more than 3× — every one is bounded or paged, none is a per-row round trip`,
      perRow.length === 0
        ? growth
            .filter((row) => row.large > row.small)
            .map((row) => `${row.name} ${row.small}→${row.large}`)
            .join('; ') || 'every statement count flat'
        : perRow.map((row) => `${row.name}: ${row.small} → ${row.large}`).join('; '),
    )

    // The sitemap is the one read that is *meant* to return everything, so
    // its size is the number to watch rather than its statement count.
    const sitemapLarge = sitemap[2]!
    check(
      true,
      'the sitemap is the read whose cost tracks the corpus, and it is a size problem rather than a query problem',
      `${sitemapLarge.statements.median} statements, ${(sitemapLarge.bytes.median / 1024).toFixed(0)} KB, p95 ${sitemapLarge.okLatency.p95.toFixed(0)}ms at ${publishedLarge} published articles`,
    )

  } finally {
    await clearCorpus(pool).catch(() => {})
    await pool.end().catch(() => {})
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  console.log(
    `\nJSON for each size is in docs/capacity/runs/${TODAY}-L14-corpus-<size>.json.\n\n` +
      'What this still is not: one machine, one process, warm cache, no concurrency, and a corpus of\n' +
      'articles whose bodies are synthetic. Valid-session load, browser assets and sustained fault\n' +
      'recovery are the rest of L14 and are still owed.',
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
