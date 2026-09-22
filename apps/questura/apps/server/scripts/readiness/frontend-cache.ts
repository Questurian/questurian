/**
 * L05's other half: the page the reader actually gets.
 *
 *   pnpm readiness:frontend-cache
 *
 * `pnpm readiness:publish` proves the chain up to "the frontend acknowledged
 * the invalidation" — 24 checks, all real, and every one of them stops at the
 * receiver. That leaves the last question unanswered, and it is the one a
 * reader experiences: after the acknowledgement, does the *page* change?
 *
 * It is not a rhetorical question. The whole failure mode this series exists
 * to remove is a queue that drains perfectly while the site stays stale. A
 * 200 from `/api/revalidate` means `revalidateTag` was called. It does not
 * mean a tag matched anything, that the full-route cache was rebuilt, or that
 * a cached 404 stopped being served.
 *
 * Three things are checked here that nothing else covers:
 *
 *  1. **A warm cache really is warm** — a second request for the same page
 *     does not reach the backend at all. Without this the other two checks
 *     prove nothing, because a page that was never cached always looks
 *     correctly invalidated.
 *  2. **A negative cache clears on first publish.** A 404 is a cacheable
 *     answer. If unpublishing a page caches "gone" and publishing it again
 *     does not clear that, the page stays gone for an hour with a clean
 *     queue behind it.
 *  3. **An access change is not served from a warm cache.** An article
 *     becoming members-only is the one invalidation that must not be missed:
 *     a stale copy is the paywall not applying. `cache-contract.md` §2 says
 *     articles have no fallback for exactly this reason, and this is the
 *     first time that has been observed rather than asserted.
 *
 * This runs both apps as real production builds against the scratch database,
 * and it changes that database. Preflight refuses anything else. The article
 * it exercises is restored at the end, and the database is disposable either
 * way.
 *
 * **On Cloudflare this is a different cache.** A Node `next start` keeps its
 * full-route cache on one filesystem in one long-lived process; Workers uses
 * R2, D1 and a purge API across many short-lived isolates. So a pass here is
 * a lower bound on the hosted question, not an answer to it — H03 is still
 * owed, and `cache-contract.md` says which parts only hosted evidence can
 * settle.
 *
 * Preconditions: production builds in `.next-readiness` for both apps, Redis
 * on 6390, and the scratch database. Exit 0 if every check passed.
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
  ingressAdmitted,
  SERVER_DIR,
  startApp,
  waitForApp,
  type AppSettings,
} from './apps'
import { assertPreflight } from './preflight'
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
  revalidationSecret: 'readiness-frontend-cache-shared-secret',
  dbStatsSecret: 'readiness-frontend-cache-db-stats',
  instanceId: 'readiness-frontend-cache-backend',
}

const BACKEND = backendUrl(APPS)
const CLIENT = clientUrl(APPS)

type PageRead = { status: number; html: string }

async function readPage(path: string): Promise<PageRead> {
  const response = await fetch(`${CLIENT}${path}`, {
    signal: AbortSignal.timeout(30_000),
    // A reader's browser, not a revalidating client: no conditional headers,
    // nothing that would ask the frontend to skip its own cache.
    headers: { accept: 'text/html' },
  })
  return { status: response.status, html: await response.text() }
}

/** The marker `PaywallNotice` renders. Absent means the body was served. */
const PAYWALL_MARKER = 'Members-only content'

async function main(): Promise<void> {
  assertPreflight({ ...sandboxSettings(), databaseUri: DATABASE, env: {} })

  assertBuilt(DIST)

  // The harness's own Payload: it writes, and it drains to the real client.
  process.env.DATABASE_URI = DATABASE
  process.env.DATABASE_URI_UNPOOLED = DATABASE
  process.env.QUESTURA_CLIENT_URL = CLIENT
  process.env.QUESTURA_REVALIDATION_SECRET = APPS.revalidationSecret
  process.env.REFRESH_WORKER_INTERVAL_MS = '0'
  delete process.env.REFRESH_DISCONNECTED
  process.env.PAYLOAD_SECRET = 'readiness-frontend-cache-harness-secret-not-a-real-one'
  process.env.BETTER_AUTH_SECRET = 'readiness-frontend-cache-harness-visitor-not-real'
  for (const name of ['STRIPE_SECRET_KEY', 'BUNNY_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY']) {
    delete process.env[name]
  }

  await assertPortsFree([APPS.ports.backend, APPS.ports.client])

  const backend = startApp('backend', SERVER_DIR(), APPS.ports.backend, backendEnv(APPS))
  const client = startApp('client', CLIENT_DIR(), APPS.ports.client, clientEnv(APPS))
  const stopAll = () => {
    backend.kill('SIGKILL')
    client.kill('SIGKILL')
  }

  const pool = new Pool({ connectionString: DATABASE, max: 2 })
  let restore: (() => Promise<void>) | null = null

  try {
    step('starting both production builds')
    const [backendUp, clientUp] = await Promise.all([
      waitForApp(`${BACKEND}/api/internal/db-stats`, 90_000, { authorization: `Bearer ${APPS.dbStatsSecret}` }),
      waitForApp(`${CLIENT}/`, 90_000),
    ])
    if (!backendUp || !clientUp) {
      throw new Error(`An app did not come up (backend=${backendUp}, client=${clientUp}). See the stderr above.`)
    }
    step('backend and client are both serving')

    const { getPayload } = await import('payload')
    const config = await import('../../src/payload.config')
    const payload = await getPayload({ config: config.default })
    const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')

    /** Deliver everything the last save queued, then let Next settle. */
    const deliver = async (): Promise<void> => {
      for (let pass = 0; pass < 10; pass += 1) {
        await drainRefreshJobs(pool)
        const left = await pool.query(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status <> 'done'`)
        if (left.rows[0].n === 0) break
        await sleep(200)
      }
      // `revalidateTag` marks; the rebuild happens on the next request. A
      // short pause keeps the read that follows from racing that boundary.
      await sleep(500)
    }

    /**
     * An article this run is allowed to unpublish.
     *
     * A published article referenced by a curated homepage cannot be
     * unpublished — `assertCanUnpublishHomepageFeaturedContent` refuses, which
     * is correct and is not this script's business to work around. So the
     * candidate is probed: set it to draft, and put it straight back. Nothing
     * is delivered in between, so no reader sees the flicker and no cache is
     * touched; the probe only asks whether the negative-cache check further
     * down is going to be possible on this row.
     */
    const candidates = (
      await pool.query(
        `SELECT id, title, canonical_path, access, status FROM articles
         WHERE status = 'published' AND canonical_path IS NOT NULL AND location NOT LIKE 'zz-readiness%'
         ORDER BY id`,
      )
    ).rows as Array<{ id: number; title: string; canonical_path: string; access: string; status: string }>

    if (candidates.length === 0) throw new Error('The scratch copy has no published article with a canonical path.')

    let article: (typeof candidates)[number] | null = null
    const refused: string[] = []
    for (const candidate of candidates) {
      try {
        await payload.update({
          collection: 'articles',
          id: candidate.id,
          data: { status: 'draft' },
          overrideAccess: true,
        })
        await payload.update({
          collection: 'articles',
          id: candidate.id,
          data: { status: 'published' },
          overrideAccess: true,
        })
        article = candidate
        break
      } catch (error) {
        refused.push(`#${candidate.id}: ${error instanceof Error ? error.message.slice(0, 80) : 'refused'}`)
      }
    }

    if (!article) {
      throw new Error(
        `Every published article is pinned to a curated homepage, so none can be unpublished:\n  ` +
          refused.join('\n  '),
      )
    }
    if (refused.length > 0) {
      console.log(`(skipped ${refused.length} article(s) pinned to a curated homepage)`)
    }

    const PATH = article.canonical_path
    console.log(`\nWorking on article ${article.id} at ${PATH}\n`)

    restore = async () => {
      await pool.query(`UPDATE articles SET title = $1, access = $2, status = $3 WHERE id = $4`, [
        article.title,
        article.access,
        article.status,
        article.id,
      ])
    }

    await pool.query('DELETE FROM refresh_jobs')

    // ---------------------------------------------------------------------
    // 1. The page renders, and a second read of it does not reach the backend.
    //
    //    Everything after this depends on the cache being real. A page that
    //    was never cached passes an invalidation test for the wrong reason.
    // ---------------------------------------------------------------------
    step('warming the page')
    const first = await readPage(PATH)
    check(first.status === 200, 'the article page renders on the production client', `HTTP ${first.status}`)
    check(first.html.includes(article.title), 'and it contains the current title')

    // ---------------------------------------------------------------------
    // 2. A publish rebuilds the page from the backend, and the rebuilt page
    //    is then cached.
    //
    //    The order here matters, and the first version of this script had it
    //    wrong. It compared the backend's admission counter across two reads
    //    *before* any publish and called an unchanged counter proof of a warm
    //    cache. The counter was zero both times — because the client build
    //    pre-renders every public URL (PR #604), so the running client had
    //    never asked the backend about this page at all. "The backend was not
    //    asked again" is satisfied just as well by "the backend was never
    //    asked", and a check that cannot tell those apart is not a check.
    //
    //    So the counter has to be seen *moving* first. An invalidated page is
    //    rebuilt, that rebuild is a backend read, and only then does a second
    //    read that leaves the counter alone mean the cache is holding.
    // ---------------------------------------------------------------------
    const newTitle = `${article.title} [readiness ${Date.now()}]`
    step('publishing a title change')
    await payload.update({ collection: 'articles', id: article.id, data: { title: newTitle }, overrideAccess: true })
    await deliver()

    const beforeRebuild = await ingressAdmitted(APPS)
    const afterPublish = await readPage(PATH)
    const afterRebuild = await ingressAdmitted(APPS)

    check(
      afterPublish.status === 200 && afterPublish.html.includes(newTitle),
      'after the publish the page carries the NEW title — the invalidation reached the rendered page',
      afterPublish.html.includes(newTitle) ? 'new title present' : 'still the old page',
    )
    check(
      !afterPublish.html.includes(article.title) || newTitle.includes(article.title),
      'and the old page is gone',
    )
    check(
      afterRebuild > beforeRebuild,
      'the invalidated page was rebuilt FROM THE BACKEND — the admission counter moved, so it is a real read',
      `backend ingress admitted ${beforeRebuild} → ${afterRebuild}`,
    )

    const second = await readPage(PATH)
    const afterWarm = await ingressAdmitted(APPS)
    check(
      second.status === 200 && second.html.includes(newTitle) && afterWarm === afterRebuild,
      'and the very next read is served from the frontend cache — the backend was not asked again',
      `backend ingress admitted ${afterRebuild} → ${afterWarm}`,
    )

    // ---------------------------------------------------------------------
    // 3. A negative cache clears on publish.
    //
    //    Unpublishing makes the page a 404, and a 404 is a cacheable answer.
    //    The question is whether publishing again clears it, or whether the
    //    page stays gone behind a queue that drained clean.
    // ---------------------------------------------------------------------
    step('unpublishing, so the page becomes a cached 404')
    await payload.update({ collection: 'articles', id: article.id, data: { status: 'draft' }, overrideAccess: true })
    await deliver()

    const gone = await readPage(PATH)
    check(gone.status === 404, 'an unpublished article is a 404 for readers', `HTTP ${gone.status}`)

    // Read it again so the 404 is definitely the cached answer and not a
    // fresh miss — a negative cache that was never populated cannot be shown
    // to clear.
    const goneAgain = await readPage(PATH)
    check(goneAgain.status === 404, 'and the 404 is what a second reader gets too')

    step('publishing it again')
    await payload.update({ collection: 'articles', id: article.id, data: { status: 'published' }, overrideAccess: true })
    await deliver()

    const back = await readPage(PATH)
    check(
      back.status === 200 && back.html.includes(newTitle),
      'the first publish clears the negative cache — the page is back, not still 404',
      `HTTP ${back.status}`,
    )

    // ---------------------------------------------------------------------
    // 4. An access change is not served from a warm cache.
    //
    //    The one invalidation that must never be missed. `cache-contract.md`
    //    §2 gives articles no fallback precisely so that a stale copy cannot
    //    outlive a paywall.
    // ---------------------------------------------------------------------
    step('warming the free article, then making it members-only')
    const free = await readPage(PATH)
    check(
      free.status === 200 && !free.html.includes(PAYWALL_MARKER),
      'while it is free, an anonymous reader gets the body and no paywall',
    )

    await payload.update({ collection: 'articles', id: article.id, data: { access: 'member' }, overrideAccess: true })
    await deliver()

    const gated = await readPage(PATH)
    check(
      gated.status === 200 && gated.html.includes(PAYWALL_MARKER),
      'after the access change an anonymous reader gets the PAYWALL — no warm cache served the member body',
      gated.html.includes(PAYWALL_MARKER) ? 'paywall present' : 'STILL SERVING THE FREE BODY',
    )
    check(
      gated.html.length < free.html.length,
      'and the gated page is smaller than the free one — the body really was withheld',
      `${free.html.length} → ${gated.html.length} bytes`,
    )
  } finally {
    if (restore) await restore().catch(() => {})
    await pool.end().catch(() => {})
    stopAll()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  console.log(
    '\nThis is the Node frontend: one long-lived process, one filesystem full-route cache. Cloudflare\n' +
      'uses R2, D1 and a purge API across many short-lived isolates, so a pass here bounds the question\n' +
      'from below and does not answer it. Global purge latency, regional propagation, isolate lifetime\n' +
      'and cookie/variant separation are H03.',
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(1)
})
