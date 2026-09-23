/**
 * Publishing, checked page by page (surge plan L09).
 *
 *   pnpm readiness:stack -- up         # the stack, its worker draining every 5 s
 *   pnpm readiness:publication         # mutates the corpus: reseed afterwards
 *
 * Every edit goes through Payload's REST API as the synthetic staff account,
 * exactly as an editor's save would. Then every affected page is polled
 * until it converges, and **every observation along the way must be a
 * complete, permitted state** — the whole old page or the whole new page.
 * A page with the new title and the old body, a page with neither, or an
 * access change whose member text shows up for anyone, fails at once.
 *
 * The old harness accepted any new title as fresh and an unchanged page by
 * its length (discovery finding 11). Here each state is recognised by
 * disjoint markers, and each scenario names every path it affects:
 *
 *  - body revision            the article page moves from R1 to R2
 *  - rename (title)           the article page, its city page grid, and search
 *                             (search is asynchronous and timed separately)
 *  - free → members-only      the public page must converge to the paywall,
 *                             and the member-only text added in the same save
 *                             must never appear publicly, at any moment
 *  - unpublish / republish    404 within the deadline, then 200 again — a
 *                             cached 404 must not outlive the republish
 *  - slug change              the new path serves; the old path redirects to it
 *  - deletion                 404 within the deadline
 *  - failed delivery          the client is frozen (SIGSTOP) during a save:
 *                             the refresh job must be retried, not marked done,
 *                             and the page must converge after the client resumes
 *
 * Evidence: `docs/capacity/runs/<date>-surge-L09-publication.json`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Pool } from 'pg'

import { LAUNCH_MANIFEST_PATH, type LaunchManifest, type LaunchPiece, STAFF_EMAIL, SYNTHETIC_PASSWORD } from './launch-corpus'
import { assertPreflight } from './preflight'
import { converge, gatingState, type Page, presenceState, renameState, revisionState } from './publication-states'
import { sandboxSettings, sourceIdentity } from './sandbox'
import { readStackState, STACK_PORTS } from './stack'

const BACKEND = `http://127.0.0.1:${STACK_PORTS.backend}`
const CLIENT = `http://127.0.0.1:${STACK_PORTS.client}`
const RUNS = resolve(process.cwd(), '../../docs/capacity/runs')

/** How long a page may take to reflect a save. The worker drains every 5 s. */
const DEADLINE_MS = Number(process.env.PUBLICATION_DEADLINE_MS ?? 45_000)
/** After a delivery failure the retry backs off 30 s (+20% jitter) first. */
const RETRY_DEADLINE_MS = Number(process.env.PUBLICATION_RETRY_DEADLINE_MS ?? 90_000)
const POLL_MS = 500

type Scenario = { name: string; ok: boolean; detail: string; convergedMs: number | null; observations: number; timeline: unknown[] }
const scenarios: Scenario[] = []

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function fetchPage(path: string): Promise<Page> {
  const response = await fetch(`${CLIENT}${path}`, { redirect: 'manual' })
  return { status: response.status, html: await response.text(), location: response.headers.get('location') }
}

async function convergeNamed(
  name: string,
  paths: string[],
  classify: (path: string, page: Page) => string | null,
  done: (state: string) => boolean,
  deadlineMs = DEADLINE_MS,
): Promise<Scenario> {
  const result = await converge({ paths, fetchPage, classify, done, deadlineMs, pollMs: POLL_MS })
  const scenario = { name, ...result }
  scenarios.push(scenario)
  return scenario
}

function report(scenario: Scenario): void {
  console.log(
    `${scenario.ok ? '  ok  ' : ' FAIL '} ${scenario.name} — ${scenario.detail}` +
      `${scenario.convergedMs !== null ? ` in ${(scenario.convergedMs / 1000).toFixed(1)}s` : ''} (${scenario.observations} observations)`,
  )
}

/** A disjoint replacement: the new marker never contains the old one, and vice versa. */
function replaceInTree(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to)
  if (Array.isArray(value)) return value.map((entry) => replaceInTree(entry, from, to))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceInTree(entry, from, to)]))
  }
  return value
}

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up')
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const pool = new Pool({ connectionString: sandboxSettings().databaseUri, max: 2 })
  const article = (index: number) => manifest.pieces.find((piece) => piece.type === 'articles' && piece.index === index)! as LaunchPiece

  // Harness artefacts from other rehearsals must not stand in the queue.
  await pool.query(`DELETE FROM refresh_jobs WHERE dedupe_key = 'restore-rehearsal-probe'`)

  const login = await fetch(`${BACKEND}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
  })
  const token = ((await login.json()) as { token?: string }).token
  if (!token) throw new Error(`Staff sign-in failed (HTTP ${login.status}).`)
  const staff = { 'content-type': 'application/json', authorization: `JWT ${token}` }

  const read = async (id: number) =>
    ((await (await fetch(`${BACKEND}/api/articles/${id}?depth=0`, { headers: staff })).json()) as Record<string, unknown>)
  const patch = async (id: number, data: Record<string, unknown>) => {
    const response = await fetch(`${BACKEND}/api/articles/${id}?depth=0`, { method: 'PATCH', headers: staff, body: JSON.stringify(data) })
    if (!response.ok) throw new Error(`Saving article ${id} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
    return (await response.json()) as { doc: Record<string, unknown> }
  }

  // Sanity: every page this run touches starts in its expected state.
  for (const index of [8, 10, 12, 14, 16, 20, 24]) {
    const piece = article(index)
    const page = await fetchPage(piece.path)
    if (page.status !== 200 || !page.html.includes(piece.markers.body)) {
      throw new Error(`${piece.path} is not in its seeded state (HTTP ${page.status}). Reseed and rebuild the client first.`)
    }
  }

  // --- Body revision ------------------------------------------------------------
  {
    const piece = article(10)
    const r2 = piece.markers.body.replace(/-R1$/, '-R2')
    const doc = await read(piece.id)
    await patch(piece.id, { contentBlocks: replaceInTree(doc.contentBlocks, piece.markers.body, r2) })
    report(
      await convergeNamed(
        'body revision R1 → R2',
        [piece.path],
        (_path, page) => revisionState(page, { title: piece.markers.title, oldBody: piece.markers.body, newBody: r2 }),
        (state) => state === 'new',
      ),
    )
  }

  // --- Rename: article page + city page, then search ----------------------------
  {
    const piece = article(8)
    const renamed = piece.markers.title.replace('LM-ART', 'LM-REN')
    const doc = await read(piece.id)
    await patch(piece.id, { title: String(doc.title).replace(piece.markers.title, renamed) })
    const city = manifest.cities.find((entry) => entry.slug === piece.city)!
    report(
      await convergeNamed(
        'rename reaches the article page and its city page',
        [piece.path, city.path],
        (path, page) =>
          renameState(page, { oldTitle: piece.markers.title, newTitle: renamed, body: path === piece.path ? piece.markers.body : undefined }),
        (state) => state === 'new',
      ),
    )

    // Search is refreshed by the worker too, but through the index rather
    // than a page render; its freshness is reported on its own.
    const started = Date.now()
    let searchMs: number | null = null
    while (Date.now() - started < DEADLINE_MS) {
      const body = (await (await fetch(`${BACKEND}/api/public/articles/search?q=${renamed}&lang=en`)).json()) as { totalDocs?: number }
      if (body.totalDocs === 1) {
        searchMs = Date.now() - started
        break
      }
      await sleep(POLL_MS)
    }
    // The old marker can still match through the meta description, which the
    // index also covers and a rename does not change — so staleness is read
    // from the indexed title itself, not from a search for the old words.
    const indexed = await pool.query<{ title: string }>(
      `SELECT title FROM public_search_documents WHERE type_key = 'articles' AND doc_id = $1`,
      [piece.id],
    )
    const indexedTitle = indexed.rows[0]?.title ?? ''
    const scenario: Scenario = {
      name: 'rename reaches search (asynchronous)',
      ok: searchMs !== null && indexedTitle.includes(renamed) && !indexedTitle.includes(piece.markers.title),
      detail: searchMs !== null ? `new title searchable; indexed title is the new one` : 'new title never became searchable',
      convergedMs: searchMs,
      observations: 0,
      timeline: [],
    }
    scenarios.push(scenario)
    report(scenario)
  }

  // --- Free → members-only, with member text added in the same save ------------
  {
    const piece = article(12)
    const secret = `GATECHECK-${String(piece.index).padStart(2, '0')}`
    const doc = await read(piece.id)
    // The closing text block is the members-only tail once the piece is gated;
    // the new member-only text goes there, in the same save as the access change.
    const blocks = JSON.parse(JSON.stringify(doc.contentBlocks)) as Array<{ content?: { root?: { children?: Array<{ children?: Array<{ text?: string }> }> } } }>
    const paragraph = blocks[blocks.length - 1]?.content?.root?.children?.[0]?.children?.[0]
    if (!paragraph) throw new Error('The closing block of the gating target is not a text block.')
    paragraph.text = `${secret} ${paragraph.text}`
    await patch(piece.id, { access: 'member', contentBlocks: blocks })
    report(
      await convergeNamed(
        'free → members-only: converges to the paywall, member text never public',
        [piece.path],
        (_path, page) => gatingState(page, { body: piece.markers.body, memberOnly: secret }),
        (state) => state === 'gated',
      ),
    )
  }

  // --- Unpublish, then republish -----------------------------------------------
  {
    const piece = article(16)
    await patch(piece.id, { status: 'draft' })
    report(
      await convergeNamed(
        'unpublish → 404',
        [piece.path],
        (_path, page) => presenceState(page, { body: piece.markers.body }),
        (state) => state === 'gone',
      ),
    )
    await patch(piece.id, { status: 'published' })
    report(
      await convergeNamed(
        'republish → 200 (a cached 404 does not outlive it)',
        [piece.path],
        (_path, page) => presenceState(page, { body: piece.markers.body }),
        (state) => state === 'present',
      ),
    )
  }

  // --- Slug change: new path serves, old path redirects -------------------------
  {
    const piece = article(20)
    const slug = `${piece.slug}-moved`
    const saved = await patch(piece.id, { slug })
    const newPath = String(saved.doc.canonicalPath ?? piece.path.replace(piece.slug, slug))
    report(
      await convergeNamed(
        'slug change: new path serves, old path redirects to it',
        [newPath, piece.path],
        (path, page) => {
          if (path === newPath) {
            if (page.status === 404) return 'not-yet'
            return page.status === 200 && page.html.includes(piece.markers.body) ? 'serving' : null
          }
          if (page.status === 200 && page.html.includes(piece.markers.body)) return 'old'
          if ([301, 307, 308].includes(page.status)) return (page.location ?? '').endsWith(newPath) ? 'redirects' : null
          return page.status === 404 ? 'not-yet' : null
        },
        (state) => state === 'serving' || state === 'redirects',
      ),
    )
  }

  // --- Deletion ----------------------------------------------------------------
  {
    const piece = article(24)
    const response = await fetch(`${BACKEND}/api/articles/${piece.id}`, { method: 'DELETE', headers: staff })
    if (!response.ok) throw new Error(`Deleting article ${piece.id} failed: HTTP ${response.status}`)
    report(
      await convergeNamed(
        'deletion → 404',
        [piece.path],
        (_path, page) => presenceState(page, { body: piece.markers.body }),
        (state) => state === 'gone',
      ),
    )
  }

  // --- Failed delivery: the client is frozen during a save -----------------------
  // Skipped under load (PUBLICATION_SKIP_FREEZE=1): freezing the client also
  // freezes every reader the load is sending to it, which measures the freeze
  // rather than publication. It runs on its own in the standalone check.
  if (process.env.PUBLICATION_SKIP_FREEZE !== '1') {
    const piece = article(14)
    const client = stack.processes.find((entry) => entry.role === 'client')!
    const r2 = piece.markers.body.replace(/-R1$/, '-R2')
    const doc = await read(piece.id)
    process.kill(client.pid, 'SIGSTOP')
    let retried = false
    try {
      await patch(piece.id, { contentBlocks: replaceInTree(doc.contentBlocks, piece.markers.body, r2) })
      // The worker drains every 5 s and each delivery times out after 5 s.
      const started = Date.now()
      while (Date.now() - started < 30_000 && !retried) {
        await sleep(1_000)
        const jobs = await pool.query<{ status: string; attempts: string }>(
          `SELECT status, attempts FROM refresh_jobs WHERE kind = 'revalidate' AND target::text LIKE $1 ORDER BY updated_at DESC LIMIT 1`,
          [`%${piece.path}%`],
        )
        const job = jobs.rows[0]
        retried = Boolean(job && job.status === 'pending' && Number(job.attempts) >= 1)
      }
    } finally {
      process.kill(client.pid, 'SIGCONT')
    }
    const retry: Scenario = {
      name: 'failed delivery is retried, not recorded as done',
      ok: retried,
      detail: retried ? 'the job went back to pending with an attempt recorded' : 'no retry was recorded while the client was frozen',
      convergedMs: null,
      observations: 0,
      timeline: [],
    }
    scenarios.push(retry)
    report(retry)
    report(
      await convergeNamed(
        'after the client resumes, the page converges',
        [piece.path],
        (_path, page) => revisionState(page, { title: piece.markers.title, oldBody: piece.markers.body, newBody: r2 }),
        (state) => state === 'new',
        RETRY_DEADLINE_MS,
      ),
    )
  }

  // --- The queue is healthy afterwards --------------------------------------------
  {
    const started = Date.now()
    let owed = -1
    while (Date.now() - started < RETRY_DEADLINE_MS) {
      owed = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status IN ('pending','running')`)).rows[0]!.n
      if (owed === 0) break
      await sleep(1_000)
    }
    const failed = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM refresh_jobs WHERE status = 'failed'`)).rows[0]!.n
    const healthy: Scenario = {
      name: 'the refresh queue drains: nothing owed, nothing failed',
      ok: owed === 0 && failed === 0,
      detail: `${owed} owed, ${failed} failed`,
      convergedMs: null,
      observations: 0,
      timeline: [],
    }
    scenarios.push(healthy)
    report(healthy)
  }

  await pool.end()
  const failed = scenarios.filter((scenario) => !scenario.ok)
  mkdirSync(RUNS, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  writeFileSync(
    resolve(RUNS, `${stamp}-surge-L09-publication.json`),
    JSON.stringify(
      {
        kind: 'surge-publication-checks',
        takenAt: new Date().toISOString(),
        source: sourceIdentity(),
        dataset: manifest.version,
        deadlines: { pageMs: DEADLINE_MS, afterFailedDeliveryMs: RETRY_DEADLINE_MS, pollMs: POLL_MS },
        result: { total: scenarios.length, passed: scenarios.length - failed.length },
        scenarios,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`\n${scenarios.length - failed.length}/${scenarios.length} publication scenarios passed. The corpus was mutated: reseed before other checks.`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
