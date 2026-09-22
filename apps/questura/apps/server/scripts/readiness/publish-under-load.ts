/**
 * L14: what a publish does to the people reading.
 *
 *   pnpm readiness:publish-under-load
 *
 * Everything measured so far took one thing at a time. Reads were measured
 * with nothing being written; publishing was measured with nobody reading.
 * The interesting state is the one nobody has looked at: an editor saving
 * while the site is being read.
 *
 * It is not obviously fine. A save holds a write transaction open while it
 * works out what to refresh; the drain that follows delivers to the frontend,
 * which then has to *rebuild* every invalidated page from the backend — so a
 * publish turns into a burst of origin reads at the exact moment readers are
 * also asking. Each of those pieces is bounded on its own. Whether they are
 * bounded together is a different question, and it is the one this answers.
 *
 * The shape is a controlled comparison:
 *
 *   Phase A   readers only, for a fixed window        → the baseline
 *   Phase B   the same readers, while an editor publishes → the comparison
 *
 * Same corpus, same paths, same concurrency, same duration. The only
 * difference between the two phases is the publishing, so a difference in the
 * numbers is attributable to it.
 *
 * The check that matters most is not latency. It is that **no reader ever saw
 * a broken page**: every response during the publish window has to be a real
 * page carrying either the old title or the new one. A half-published state
 * reaching a reader is a correctness failure; a slower page is a capacity
 * question.
 *
 * Preconditions: production builds in `.next-readiness` for both apps, Redis
 * on 6390, the scratch database. Exit 0 if every check passed.
 */

import { Pool } from 'pg'

import {
  assertBuilt,
  assertPortsFree,
  backendEnv,
  backendUrl,
  clientEnv,
  clientUrl,
  CLIENT_DIR,
  ingressRefusals,
  readBackendStats,
  SERVER_DIR,
  startApp,
  waitForApp,
  type AppSettings,
} from './apps'
import { buildCorpus, clearCorpus } from './corpus'
import { assertPreflight } from './preflight'
import { flushSandboxRedis } from './sandbox-redis'
import { sandboxSettings } from './sandbox'

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): void {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const step = (message: string) => console.log(`--- ${message}`)
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const DATABASE =
  process.env.READINESS_DATABASE_URI ?? `postgres://${process.env.USER}@127.0.0.1:5432/questura_readiness_scratch`
const REDIS = process.env.READINESS_REDIS_URL ?? 'redis://127.0.0.1:6390'
const DIST = process.env.NEXT_DIST_DIR ?? '.next-readiness'

const APPS: AppSettings = {
  ports: { backend: 4100, client: 3100 },
  databaseUri: DATABASE,
  redisUri: REDIS,
  dist: DIST,
  revalidationSecret: 'readiness-publish-under-load-secret',
  dbStatsSecret: 'readiness-publish-under-load-db-stats',
  instanceId: 'readiness-publish-under-load-backend',
}

const BACKEND = backendUrl(APPS)
const CLIENT = clientUrl(APPS)

/** Readers per phase, and how long each phase runs. */
const READERS = Number(process.env.READINESS_READERS ?? 6)
const PHASE_SECONDS = Number(process.env.READINESS_PHASE_SECONDS ?? 20)
/** How many articles the editor saves during phase B. */
const PUBLISHES = Number(process.env.READINESS_PUBLISHES ?? 8)

type Sample = {
  ms: number
  status: number
  path: string
  bodyOk: boolean
  sawNew: boolean
  /** What the page's headline actually said, so a failure is diagnosable. */
  headline: string | null
}

type PhaseResult = {
  samples: Sample[]
  statuses: Record<number, number>
  transportFailures: number
}

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

/**
 * Concurrent readers, for a fixed wall-clock window.
 *
 * A fixed *duration* rather than a fixed count, because the two phases have to
 * be comparable: a count-based loop under a slower system simply takes longer
 * and measures a different window. `validate` is how a reader says whether the
 * page it got was a real one — an HTTP 200 carrying a broken body is the
 * failure this is looking for, and status alone cannot see it.
 */
async function readFor(
  paths: string[],
  seconds: number,
  readers: number,
  validate: (path: string, html: string) => { bodyOk: boolean; sawNew: boolean; headline: string | null },
): Promise<PhaseResult> {
  const result: PhaseResult = { samples: [], statuses: {}, transportFailures: 0 }
  const until = Date.now() + seconds * 1_000

  const reader = async (offset: number): Promise<void> => {
    let index = offset
    while (Date.now() < until) {
      const path = paths[index++ % paths.length]!
      const started = Date.now()
      try {
        const response = await fetch(`${CLIENT}${path}`, {
          headers: { accept: 'text/html' },
          signal: AbortSignal.timeout(30_000),
        })
        const html = await response.text()
        result.statuses[response.status] = (result.statuses[response.status] ?? 0) + 1
        const verdict =
          response.status === 200 ? validate(path, html) : { bodyOk: false, sawNew: false, headline: null }
        result.samples.push({
          ms: Date.now() - started,
          status: response.status,
          path,
          bodyOk: verdict.bodyOk,
          sawNew: verdict.sawNew,
          headline: verdict.headline,
        })
      } catch {
        result.transportFailures += 1
      }
    }
  }

  await Promise.all(Array.from({ length: readers }, (_, index) => reader(index)))
  return result
}

async function main(): Promise<void> {
  assertPreflight({ ...sandboxSettings(), databaseUri: DATABASE, env: {} })
  assertBuilt(DIST)
  await assertPortsFree([APPS.ports.backend, APPS.ports.client])

  process.env.DATABASE_URI = DATABASE
  process.env.DATABASE_URI_UNPOOLED = DATABASE
  process.env.QUESTURA_CLIENT_URL = CLIENT
  process.env.QUESTURA_REVALIDATION_SECRET = APPS.revalidationSecret
  process.env.REFRESH_WORKER_INTERVAL_MS = '0'
  delete process.env.REFRESH_DISCONNECTED
  process.env.PAYLOAD_SECRET = 'readiness-publish-under-load-harness-secret-not-real'
  process.env.BETTER_AUTH_SECRET = 'readiness-publish-under-load-harness-visitor-not-real'
  for (const name of ['STRIPE_SECRET_KEY', 'BUNNY_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY']) {
    delete process.env[name]
  }

  const backend = startApp('backend', SERVER_DIR(), APPS.ports.backend, backendEnv(APPS))
  const client = startApp('client', CLIENT_DIR(), APPS.ports.client, clientEnv(APPS))
  const stopAll = () => {
    backend.kill('SIGKILL')
    client.kill('SIGKILL')
  }

  const pool = new Pool({ connectionString: DATABASE, max: 4 })
  const titles = new Map<number, string>()

  try {
    step('starting both production builds')
    const [backendUp, clientUp] = await Promise.all([
      waitForApp(`${BACKEND}/api/internal/db-stats`, 90_000, { authorization: `Bearer ${APPS.dbStatsSecret}` }),
      waitForApp(`${CLIENT}/`, 90_000),
    ])
    if (!backendUp || !clientUp) {
      throw new Error(`An app did not come up (backend=${backendUp}, client=${clientUp}). See the stderr above.`)
    }

    const { getPayload } = await import('payload')
    const config = await import('../../src/payload.config')
    const payload = await getPayload({ config: config.default })
    const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')

    // A corpus, so the pages readers ask for are not the same three rows.
    step('building the medium corpus')
    await buildCorpus(pool, 'medium', 20260922)

    // The articles the editor will save. Real ones with real bodies: a
    // synthetic row has no blocks, so publishing it would exercise the outbox
    // without exercising the rebuild that follows.
    const editable = (
      await pool.query(
        `SELECT id, title, canonical_path FROM articles
         WHERE status = 'published' AND canonical_path IS NOT NULL AND location NOT LIKE 'zz-readiness%'
         ORDER BY id LIMIT $1`,
        [PUBLISHES],
      )
    ).rows as Array<{ id: number; title: string; canonical_path: string }>

    if (editable.length === 0) throw new Error('The scratch copy has no published article with a canonical path.')
    for (const row of editable) titles.set(row.id, row.title)

    // What readers ask for: the pages about to change, plus pages that are
    // not changing at all. The second group is the one that answers "does a
    // publish hurt readers who were not reading the published page".
    const changing = editable.map((row) => row.canonical_path)
    const unrelated = ['/peru/lima', '/peru', '/zz-readiness/city-0000', '/zz-readiness']
    const paths = [...changing, ...unrelated]

    /**
     * The new title is deliberately **disjoint** from the old one.
     *
     * The first version appended a suffix — `"<original> [under load …]"` —
     * which contains the original as a substring, so "the page carries the old
     * title or the new one" was true of every page whatever happened. Two
     * strings with no overlap make it an exclusive or, which is what "never a
     * half-published state" actually requires.
     */
    const runStamp = Date.now()
    const newTitleFor = (id: number): string => `Readiness under load ${id} ${runStamp}`

    /**
     * The headline, not the document.
     *
     * Searching the whole HTML for the title does not work, and the reason is
     * worth knowing: an article's **SEO title is a separate field**
     * (`seo_section_seo_title`) and does not follow the article title, so
     * after a rename the old string is still in `<title>` and the Open Graph
     * tags — correctly. A whole-document check therefore sees both versions at
     * once and cannot tell them apart; it reported 7,000 "half-published"
     * pages that were nothing of the sort.
     *
     * The page also carries several `<h1>` elements — the brand mark renders
     * as one, three times over — so the headline is the first `h1` that is not
     * the brand.
     */
    const BRAND = 'Questurian'

    /**
     * Entities have to be decoded before the comparison.
     *
     * React escapes an apostrophe to `&#x27;`, so the one title in the corpus
     * containing one — *A Beginner's Guide to When to Visit Lima, Peru* —
     * matched neither the old string nor the new one, and ninety-one reads
     * were reported as half-published pages. They were correct pages with an
     * apostrophe in them.
     */
    const decodeEntities = (value: string): string =>
      value
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;|&#34;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')

    const headlineOf = (html: string): string | null => {
      for (const match of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)) {
        const text = decodeEntities(match[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
        if (text && text !== BRAND) return text
      }
      return null
    }

    /**
     * A page is real if it is not an error shell, and — for a page being
     * republished — if its headline reads as exactly one of the two versions.
     */
    const validate = (
      path: string,
      html: string,
    ): { bodyOk: boolean; sawNew: boolean; headline: string | null } => {
      if (html.length < 2_000) return { bodyOk: false, sawNew: false, headline: null }

      const row = editable.find((entry) => entry.canonical_path === path)
      if (!row) return { bodyOk: true, sawNew: false, headline: null }

      const headline = headlineOf(html)
      if (!headline) return { bodyOk: false, sawNew: false, headline: null }

      const isOld = headline === titles.get(row.id)!
      const isNew = headline === newTitleFor(row.id)
      return { bodyOk: isOld !== isNew, sawNew: isNew, headline }
    }

    await pool.query('DELETE FROM refresh_jobs')
    await flushSandboxRedis(REDIS)

    step(`warming ${paths.length} paths`)
    for (const path of paths) await fetch(`${CLIENT}${path}`).then((r) => r.text()).catch(() => '')

    // ---------------------------------------------------------------------
    // Phase A: readers only.
    // ---------------------------------------------------------------------
    await flushSandboxRedis(REDIS)
    step(`phase A — ${READERS} readers for ${PHASE_SECONDS}s, nothing being published`)
    const baseline = await readFor(paths, PHASE_SECONDS, READERS, validate)
    const baselineMs = baseline.samples.filter((s) => s.status === 200).map((s) => s.ms)
    console.log(
      `    ${baseline.samples.length} reads, p50 ${percentile(baselineMs, 50)}ms, p95 ${percentile(baselineMs, 95)}ms`,
    )

    // ---------------------------------------------------------------------
    // Phase B: the same readers, while an editor publishes.
    // ---------------------------------------------------------------------
    await flushSandboxRedis(REDIS)
    step(`phase B — the same load, while ${PUBLISHES} articles are published`)

    const publishDurations: number[] = []
    const publishErrors: string[] = []
    let drainedAt = 0

    const publisher = (async () => {
      // A beat, so the readers are at steady state before the first save.
      await sleep(1_000)
      for (const row of editable) {
        const startedAt = Date.now()
        try {
          await payload.update({
            collection: 'articles',
            id: row.id,
            data: { title: newTitleFor(row.id) },
            overrideAccess: true,
          })
          // Deliver it, exactly as the worker would: this is the part that
          // makes the frontend rebuild while the readers are still reading.
          await drainRefreshJobs(pool)
        } catch (error) {
          publishErrors.push(error instanceof Error ? error.message.slice(0, 120) : String(error))
        }
        publishDurations.push(Date.now() - startedAt)
        await sleep(500)
      }

      // Anything the last drain did not finish.
      for (let pass = 0; pass < 20; pass += 1) {
        const left = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status <> 'done'`)
        if (left.rows[0].n === 0) break
        await drainRefreshJobs(pool)
        await sleep(200)
      }
      drainedAt = Date.now()
    })()

    const [underLoad] = await Promise.all([readFor(paths, PHASE_SECONDS, READERS, validate), publisher])
    const underLoadMs = underLoad.samples.filter((s) => s.status === 200).map((s) => s.ms)
    console.log(
      `    ${underLoad.samples.length} reads, p50 ${percentile(underLoadMs, 50)}ms, p95 ${percentile(underLoadMs, 95)}ms`,
    )

    const backlog = (await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status <> 'done'`)).rows[0].n
    const failedJobs = (await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status = 'failed'`)).rows[0]
      .n
    const refusals = await ingressRefusals(APPS)
    const stats = await readBackendStats(APPS)

    console.log('')

    // ---------------------------------------------------------------------
    // What has to be true.
    // ---------------------------------------------------------------------

    // The correctness check. A slower page is a capacity question; a broken
    // one is not.
    const broken = underLoad.samples.filter((sample) => !sample.bodyOk)
    check(
      broken.length === 0,
      'every reader saw a real page throughout the publish — no half-published state, no error shell',
      broken.length === 0
        ? `${underLoad.samples.length} reads all valid`
        : `${broken.length} bad reads, e.g. ${broken[0]!.path} HTTP ${broken[0]!.status} headline ${JSON.stringify(broken[0]!.headline)}`,
    )

    // Without this the correctness check above is vacuous: a publish nobody
    // observed cannot have shown anybody a half-published page.
    const sawNew = underLoad.samples.filter((sample) => sample.sawNew).length
    check(
      sawNew > 0,
      'readers actually observed the change during the window — the publish reached them, so the check above had something to catch',
      `${sawNew} of ${underLoad.samples.length} reads carried a new title`,
    )

    check(
      underLoad.transportFailures === 0 && !Object.keys(underLoad.statuses).some((s) => Number(s) >= 500),
      'no read failed while publishing',
      `statuses ${JSON.stringify(underLoad.statuses)}, ${underLoad.transportFailures} transport failures`,
    )

    check(publishErrors.length === 0, 'every save succeeded under read load', publishErrors.join('; ') || 'none threw')

    check(
      backlog === 0 && failedJobs === 0,
      'the refresh queue kept up — it drained to empty and nothing landed in failed',
      `${backlog} outstanding, ${failedJobs} failed`,
    )

    // The comparison. Publishing costs readers *something* — invalidated
    // pages have to be rebuilt from the origin — so the bar is that it is a
    // cost rather than a cliff.
    const baselineP95 = percentile(baselineMs, 95)
    const loadedP95 = percentile(underLoadMs, 95)
    const ratio = loadedP95 / Math.max(baselineP95, 1)
    check(
      ratio < 5,
      'publishing slows readers without a cliff — p95 under 5× the quiet baseline',
      `p95 ${baselineP95}ms → ${loadedP95}ms (${ratio.toFixed(2)}×)`,
    )

    check(
      Object.keys(refusals).length === 0,
      'no admission gate refused any work during the publish — the rebuild burst fits inside the budget',
      Object.keys(refusals).length === 0 ? 'nothing refused' : JSON.stringify(refusals),
    )

    // Throughput, reported rather than asserted: how much reading was given up
    // to keep publishing, which is the trade an operator actually cares about.
    const throughputDrop = 1 - underLoad.samples.length / Math.max(baseline.samples.length, 1)
    check(
      true,
      'reader throughput during the publish window, against the quiet baseline',
      `${baseline.samples.length} → ${underLoad.samples.length} reads (${(throughputDrop * 100).toFixed(0)}% fewer)`,
    )

    console.log('\nPublishes:')
    console.log(
      `  ${PUBLISHES} saves, each including its delivery: ` +
        `p50 ${percentile(publishDurations, 50)}ms, p95 ${percentile(publishDurations, 95)}ms, ` +
        `slowest ${Math.max(...publishDurations)}ms`,
    )
    console.log(
      `  queue empty ${drainedAt ? `${((drainedAt - (Date.now() - PHASE_SECONDS * 1000)) / 1000).toFixed(1)}s into the window` : 'not recorded'}` +
        `, payload pool ${stats.payloadPool?.total ?? '?'} total / ${stats.payloadPool?.waiting ?? '?'} waiting at the end`,
    )
  } finally {
    // Titles back, corpus gone. The database is disposable either way.
    for (const [id, title] of titles) {
      await pool.query(`UPDATE articles SET title = $1 WHERE id = $2`, [title, id]).catch(() => {})
    }
    await clearCorpus(pool).catch(() => {})
    await pool.end().catch(() => {})
    stopAll()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  console.log(
    '\nOne machine, one backend process, one frontend process, six readers. This says publishing and\n' +
      'reading do not break each other and puts a number on what publishing costs readers. It is not a\n' +
      'capacity result, and the rebuild burst on Cloudflare reaches a different cache from a different\n' +
      'number of isolates — H03 and H04.',
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
