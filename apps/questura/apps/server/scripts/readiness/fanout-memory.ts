/**
 * L03: what target discovery costs when an author's career is large.
 *
 *   pnpm readiness:fanout
 *
 * `authoredArticlesTarget` was made to read a page at a time
 * (`AUTHOR_PAGE_SIZE = 200`) instead of asking Postgres for every published
 * document at once. Fifteen unit tests cover that it paginates, that it stops
 * on `hasNextPage`, and that a page boundary cannot skip a document. None of
 * them measure anything: they run against a handful of fake documents, and a
 * memory profile is not something a unit test can assert.
 *
 * The distinction this measures is the one pagination does *not* remove.
 * Reading a page at a time bounds the size of each database round trip. It
 * does not bound the result, because every page's targets are appended to one
 * array and the merged target is returned whole. So the question is not "is
 * the query bounded" — it is, and that is already proven — but "what is the
 * peak heap of a save by an author with a thousand articles, and does it grow
 * linearly or worse".
 *
 * This runs the real function against a real Payload instance and a real
 * database, at four corpus sizes, and reports:
 *
 *  - peak heap above baseline while the fan-out runs;
 *  - heap still retained once it returns;
 *  - bytes per published article, which is the number that says whether the
 *    growth is linear;
 *  - how many HTTP requests the resulting target becomes, since delivery
 *    chunks at a hundred entries per request.
 *
 * It needs `--expose-gc` so a baseline is a baseline rather than whatever the
 * previous size left behind; the package script supplies it.
 *
 * Exit 0 if every check passed, 1 otherwise.
 */

import { Pool } from 'pg'

import { buildAuthorCorpus, clearCorpus } from './corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const DATABASE =
  process.env.READINESS_DATABASE_URI ?? `postgres://${process.env.USER}@127.0.0.1:5432/questura_readiness_scratch`

/** The sizes measured. Four points, because two cannot show a curve. */
const SIZES = (process.env.READINESS_FANOUT_SIZES ?? '250,1000,4000,16000').split(',').map(Number)

const MB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

type Measurement = {
  articles: number
  tags: number
  paths: number
  /** The answer's own size, computed exactly. See `targetBytes`. */
  answerBytes: number
  peakBytes: number
  retainedBytes: number
  durationMs: number
  requests: number
}

/**
 * The size of the answer, counted rather than inferred.
 *
 * Heap deltas were the first thing tried here and they are not good enough on
 * their own: a peak taken during the call includes every page's documents
 * that V8 has not collected yet, and a "retained" figure at a thousand
 * articles came out *smaller* than at two hundred, because Payload's own
 * caches move more than the target does. Both numbers are still reported —
 * peak heap is what an operator has to have headroom for — but the cost of
 * the answer itself is arithmetic, and arithmetic does not have noise.
 *
 * Two bytes per character is V8's one-byte-string case rounded up, plus a
 * pointer per array slot. It is an estimate of a lower bound, and it is
 * labelled as one.
 */
function targetBytes(tags: string[], paths: string[]): number {
  let total = 0
  for (const value of tags) total += value.length * 2 + 24
  for (const value of paths) total += value.length * 2 + 24
  return total
}

/**
 * Heap while a promise runs.
 *
 * `process.memoryUsage()` is synchronous and cheap, and the fan-out is mostly
 * waiting on Postgres, so a 5ms sampler sees the allocation pattern without
 * distorting it. The peak is what matters: a function that briefly holds two
 * copies of a large array is a different risk from one that holds one, and
 * only a sample taken during the call can tell them apart.
 */
async function withHeapSampling<T>(work: () => Promise<T>): Promise<{ value: T; peak: number; durationMs: number }> {
  let peak = process.memoryUsage().heapUsed
  const timer = setInterval(() => {
    const used = process.memoryUsage().heapUsed
    if (used > peak) peak = used
  }, 5)

  const started = Date.now()
  try {
    const value = await work()
    return { value, peak, durationMs: Date.now() - started }
  } finally {
    clearInterval(timer)
  }
}

/** Collect until the heap stops shrinking, so "retained" means retained. */
function settle(): number {
  const gc = (globalThis as { gc?: () => void }).gc
  if (!gc) throw new Error('This measurement needs --expose-gc; run it through `pnpm readiness:fanout`.')
  let previous = Infinity
  for (let pass = 0; pass < 6; pass += 1) {
    gc()
    const used = process.memoryUsage().heapUsed
    if (used >= previous - 64 * 1024) return used
    previous = used
  }
  return process.memoryUsage().heapUsed
}

async function main(): Promise<void> {
  assertPreflight({ ...sandboxSettings(), databaseUri: DATABASE, env: {} })

  process.env.DATABASE_URI = DATABASE
  process.env.DATABASE_URI_UNPOOLED = DATABASE
  // Nothing in this run delivers anything; the fan-out is a pure read.
  process.env.REFRESH_WORKER_INTERVAL_MS = '0'
  process.env.REFRESH_DISCONNECTED = '1'
  process.env.PAYLOAD_SECRET = 'readiness-fanout-secret-not-a-real-one'
  process.env.BETTER_AUTH_SECRET = 'readiness-fanout-visitor-secret-not-real'
  for (const name of ['STRIPE_SECRET_KEY', 'BUNNY_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY']) {
    delete process.env[name]
  }

  const { getPayload } = await import('payload')
  const config = await import('../../src/payload.config')
  const payload = await getPayload({ config: config.default })

  const { authoredArticlesTarget, AUTHOR_PAGE_SIZE } = await import(
    '../../src/features/public-revalidation/revalidation/targets'
  )
  const { MAX_TARGETS_PER_REQUEST } = await import('../../src/features/public-revalidation/revalidation/delivery')

  const pool = new Pool({ connectionString: DATABASE, max: 2 })
  const measurements: Measurement[] = []

  try {
    for (const articles of SIZES) {
      process.stdout.write(`--- building ${articles} published articles for one author… `)
      const { authorId } = await buildAuthorCorpus(pool, articles, 20260922)
      console.log('done')

      const baseline = settle()
      const { value: target, peak, durationMs } = await withHeapSampling(() =>
        // Only `req.payload.find` is used, which is why a full request object
        // is not needed — and why passing one would hide what this depends on.
        authoredArticlesTarget({ payload } as never, authorId),
      )
      const afterwards = settle()

      const tags = target.tags?.length ?? 0
      const paths = target.paths?.length ?? 0
      const requests =
        Math.ceil(tags / MAX_TARGETS_PER_REQUEST) + Math.ceil(paths / MAX_TARGETS_PER_REQUEST)

      measurements.push({
        articles,
        tags,
        paths,
        answerBytes: targetBytes(target.tags ?? [], target.paths ?? []),
        peakBytes: Math.max(0, peak - baseline),
        retainedBytes: Math.max(0, afterwards - baseline),
        durationMs,
        requests,
      })

      const answer = measurements[measurements.length - 1]!.answerBytes
      console.log(
        `    ${articles} articles → ${tags} tags + ${paths} paths, answer ${MB(answer)}, ` +
          `peak heap ${MB(peak - baseline)}, ${durationMs}ms, ${requests} requests`,
      )
    }

    console.log('')

    // -----------------------------------------------------------------------
    // What the numbers have to show.
    // -----------------------------------------------------------------------
    const largest = measurements[measurements.length - 1]!
    const smallest = measurements[0]!

    check(
      largest.tags >= largest.articles,
      'the target carries at least one tag per article — the fan-out is not silently truncating',
      `${largest.tags} tags for ${largest.articles} articles`,
    )

    const ratio = largest.articles / smallest.articles
    const answerRatio = largest.answerBytes / Math.max(smallest.answerBytes, 1)
    check(
      answerRatio > ratio * 0.8 && answerRatio < ratio * 1.25,
      'the answer grows linearly with the number of articles — one entry per article, no worse',
      `${ratio}× the articles produced ${answerRatio.toFixed(2)}× the answer`,
    )

    // The honest one: pagination bounds the query, nothing bounds the answer.
    const onePageAnswer = largest.answerBytes / (largest.articles / AUTHOR_PAGE_SIZE)
    check(
      largest.answerBytes > onePageAnswer * 2,
      `the answer is NOT bounded by AUTHOR_PAGE_SIZE (${AUTHOR_PAGE_SIZE}) — every page is accumulated`,
      `${MB(largest.answerBytes)} held for ${largest.articles} articles against ~${MB(onePageAnswer)} for one page`,
    )

    // Peak heap is dominated by the documents Payload materialises per page,
    // not by the answer. That is a bigger number and a shorter-lived one, and
    // conflating them is how a memory budget gets set from the wrong figure.
    check(
      largest.peakBytes > largest.answerBytes,
      'peak heap during the fan-out is larger than the answer — the transient cost is the page materialisation',
      `peak ${MB(largest.peakBytes)} against an answer of ${MB(largest.answerBytes)}`,
    )

    // Growth of the *peak* is the operator's headroom question, and it is the
    // noisy one, so the bar is deliberately generous: what would fail here is
    // quadratic growth, not measurement jitter.
    const peakRatio = largest.peakBytes / Math.max(smallest.peakBytes, 1)
    check(
      peakRatio < ratio * 2.5,
      'peak heap grows about linearly with the corpus, not faster',
      `${ratio}× the articles produced ${peakRatio.toFixed(1)}× the peak heap`,
    )

    check(
      largest.requests === Math.ceil(largest.tags / 100) + Math.ceil(largest.paths / 100),
      'delivery cost grows with the fan-out too — one hundred entries per request, sequentially',
      `${largest.requests} requests for one save`,
    )

    console.log("\nMeasured, inside the editor's save:\n")
    console.log('  articles |    tags |   paths |    answer | peak heap |   time | requests')
    for (const row of measurements) {
      console.log(
        `  ${String(row.articles).padStart(8)} | ${String(row.tags).padStart(7)} | ${String(row.paths).padStart(7)} | ` +
          `${MB(row.answerBytes).padStart(9)} | ${MB(row.peakBytes).padStart(9)} | ` +
          `${String(row.durationMs + 'ms').padStart(6)} | ${String(row.requests).padStart(8)}`,
      )
    }

    console.log(
      `\nRead this as: pagination bounds each round trip to ${AUTHOR_PAGE_SIZE} rows, which is what it was for,\n` +
        `and that part holds. It does not bound the answer. Every page's tags and paths are appended to one\n` +
        `array and returned whole, so the answer, the peak heap and the number of delivery requests all grow\n` +
        `with the size of a career. At ${largest.articles} articles the answer is ${MB(largest.answerBytes)}, the peak heap is\n` +
        `${MB(largest.peakBytes)} inside a save holding a write transaction open, and the frontend then gets\n` +
        `${largest.requests} sequential requests. None of those is a bug today; all three are the shape that stops\n` +
        `being fine without anything changing.`,
    )

  } finally {
    await clearCorpus(pool).catch(() => {})
    await pool.end()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  // Explicit: a booted Payload holds its pools open, so the process has live
  // handles after the last check and would otherwise sit there looking busy.
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
