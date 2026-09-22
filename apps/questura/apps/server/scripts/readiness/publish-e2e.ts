/**
 * The publishing chain, end to end, against a real database.
 *
 *   pnpm readiness:publish
 *
 * Everything before this proves a piece: that the enqueue is in the
 * transaction, that a stale worker cannot complete, that the fan-out is
 * bounded. None of them prove the chain. This does: a real Payload save, a
 * real commit, a real worker on a separate pool, a real delivery to a
 * receiver that can be told to fail, and the search row read back from the
 * table the public search actually queries.
 *
 * It runs against `questura_readiness_scratch`, a copy of a development
 * database, and it changes that copy. Preflight refuses anything else
 * (`preflight.ts`). Nothing external is contacted: the frontend is the local
 * fault receiver, and every paid-service credential is removed from the
 * process before Payload boots.
 *
 * Failure injection uses a Postgres trigger rather than a mock, because the
 * question is what a *real* failed insert does to a *real* save.
 *
 * Exit 0 if every check passed, 1 otherwise.
 */

import { Pool } from 'pg'

import { FaultReceiver } from './fault-receiver'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'

const checks: Array<{ ok: boolean; label: string; detail?: string }> = []

function check(ok: unknown, label: string, detail?: string): boolean {
  const passed = Boolean(ok)
  checks.push({ ok: passed, label, detail })
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail && !passed ? ` — ${detail}` : ''}`)
  return passed
}

const DATABASE =
  process.env.READINESS_DATABASE_URI ?? `postgres://${process.env.USER}@127.0.0.1:5432/questura_readiness_scratch`

async function main(): Promise<void> {
  const settings = { ...sandboxSettings(), databaseUri: DATABASE, env: {} }
  assertPreflight(settings)

  const receiver = new FaultReceiver()
  const port = await receiver.listen()

  // Set before importing the config: it reads these at module load.
  process.env.DATABASE_URI = DATABASE
  process.env.DATABASE_URI_UNPOOLED = DATABASE
  process.env.QUESTURA_CLIENT_URL = `http://127.0.0.1:${port}`
  process.env.QUESTURA_REVALIDATION_SECRET = 'readiness-publish-e2e'
  process.env.REFRESH_WORKER_INTERVAL_MS = '0'
  // Synthetic, and deliberately not the real ones: `.env` is never loaded
  // here, so nothing in this run can decrypt a stored service-account key or
  // sign a session another process would accept.
  process.env.PAYLOAD_SECRET = 'readiness-publish-e2e-secret-not-a-real-one'
  process.env.BETTER_AUTH_SECRET = 'readiness-publish-e2e-visitor-secret-not-real'
  for (const name of ['STRIPE_SECRET_KEY', 'BUNNY_API_KEY', 'RESEND_API_KEY', 'GOOGLE_MAPS_API_KEY']) {
    delete process.env[name]
  }

  const { getPayload } = await import('payload')
  const config = await import('../../src/payload.config')
  const payload = await getPayload({ config: config.default })

  // A second connection, standing in for another process: the worker and the
  // observer never share the save's connection, which is the whole point.
  const other = new Pool({ connectionString: DATABASE, max: 4 })

  const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')

  const jobs = async (where = '') =>
    (
      await other.query(
        `SELECT id, kind, dedupe_key, status, generation, target, attempts FROM refresh_jobs ${where} ORDER BY id`,
      )
    ).rows as Array<{
      id: number
      kind: string
      dedupe_key: string
      status: string
      generation: string
      target: { tags?: string[]; paths?: string[]; type?: string; id?: string }
      attempts: string
    }>

  const searchRow = async (id: number) =>
    (
      await other.query(
        `SELECT title, indexed_at FROM public_search_documents WHERE type_key = 'articles' AND doc_id = $1`,
        [id],
      )
    ).rows[0] as { title: string; indexed_at: string } | undefined

  const titleOf = async (id: number) =>
    (await other.query(`SELECT title FROM articles WHERE id = $1`, [id])).rows[0].title as string

  const pathOf = async (id: number) =>
    (await other.query(`SELECT canonical_path FROM articles WHERE id = $1`, [id])).rows[0].canonical_path as string

  const article = (
    await other.query(`SELECT id, slug, title, canonical_path FROM articles WHERE status = 'published' ORDER BY id LIMIT 1`)
  ).rows[0] as { id: number; slug: string; title: string; canonical_path: string }

  if (!article) throw new Error('The working copy has no published article to exercise.')
  console.log(`\nWorking on article ${article.id} (${article.slug})\n`)

  try {
    await other.query('DELETE FROM refresh_jobs')
    receiver.reset()

    // ---------------------------------------------------------------------
    // 1. A save records its obligation, and the worker does the work after
    //    the commit — not during it.
    // ---------------------------------------------------------------------
    const firstTitle = `${article.title} [readiness ${Date.now()}]`
    await payload.update({ collection: 'articles', id: article.id, data: { title: firstTitle }, overrideAccess: true })

    const afterSave = await jobs()
    check(
      afterSave.length >= 2,
      'a save leaves both obligations committed and visible to another connection',
      `saw ${afterSave.length}`,
    )
    check(
      afterSave.some((job) => job.kind === 'search-index' && job.target.id === String(article.id)),
      'the search obligation names the document',
    )
    check(
      afterSave.some((job) => job.kind === 'revalidate' && (job.target.paths ?? []).includes(article.canonical_path)),
      'the revalidate obligation names the public path',
      JSON.stringify(afterSave.find((job) => job.kind === 'revalidate')?.target),
    )
    check(receiver.deliveries.length === 0, 'nothing was delivered during the save itself')

    const before = await searchRow(article.id)
    check(before?.title !== firstTitle, 'the search row has not been rewritten yet — the worker has not run')

    // ---------------------------------------------------------------------
    // 2. A different process finds the obligation and completes the chain.
    //    This is the crash-after-commit case: the saving process never drains.
    // ---------------------------------------------------------------------
    const drained = await drainRefreshJobs(other as never, { concurrency: 4 })
    check(drained.done >= 2 && drained.failed === 0, 'a worker on another pool finishes the work', JSON.stringify(drained))

    const after = await searchRow(article.id)
    check(after?.title === firstTitle, 'the search row now holds the new title, from one edit', after?.title)
    check(
      receiver.allPaths().has(article.canonical_path),
      'the frontend was told to invalidate the article path',
      [...receiver.allPaths()].join(', '),
    )

    // ---------------------------------------------------------------------
    // 3. The frontend is down. The obligation must survive, not be marked done.
    // ---------------------------------------------------------------------
    await other.query('DELETE FROM refresh_jobs')
    receiver.reset()
    receiver.mode = { kind: 'status', status: 500 }

    const outageTitle = `${article.title} [outage ${Date.now()}]`
    await payload.update({ collection: 'articles', id: article.id, data: { title: outageTitle }, overrideAccess: true })

    const duringOutage = await drainRefreshJobs(other as never, { concurrency: 4 })
    check(duringOutage.retried >= 1, 'a refused delivery is retried, not completed', JSON.stringify(duringOutage))

    const stillOwed = await jobs(`WHERE kind = 'revalidate'`)
    check(stillOwed[0]?.status === 'pending', 'the obligation is still owed after the frontend refused it', stillOwed[0]?.status)
    check(
      (await searchRow(article.id))?.title === outageTitle,
      'the search row is still updated — it does not depend on the frontend',
    )

    // Recovery: the frontend comes back, a later drain delivers the exact
    // revision that was published during the outage.
    receiver.mode = { kind: 'ok' }
    await other.query(`UPDATE refresh_jobs SET next_attempt_at = now() - interval '1 second' WHERE status = 'pending'`)
    const recovered = await drainRefreshJobs(other as never, { concurrency: 4 })
    check(recovered.done >= 1, 'recovery delivers the work the outage deferred', JSON.stringify(recovered))
    check(receiver.allPaths().has(article.canonical_path), 'and it names the same path')

    // ---------------------------------------------------------------------
    // 4. The obligation cannot be written. The save must fail, and the
    //    content must be unchanged.
    // ---------------------------------------------------------------------
    await other.query('DELETE FROM refresh_jobs')
    receiver.reset()

    const titleBefore = await titleOf(article.id)
    await other.query(`
      CREATE OR REPLACE FUNCTION readiness_break_outbox() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'readiness: refresh_jobs is unavailable'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER readiness_break_outbox BEFORE INSERT ON refresh_jobs
      FOR EACH ROW EXECUTE FUNCTION readiness_break_outbox();
    `)

    let saveFailed = false
    let message = ''
    try {
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: { title: `${article.title} [must not persist]` },
        overrideAccess: true,
      })
    } catch (error) {
      saveFailed = true
      message = error instanceof Error ? error.message : String(error)
    } finally {
      await other.query('DROP TRIGGER IF EXISTS readiness_break_outbox ON refresh_jobs')
    }

    check(saveFailed, 'a save whose obligation cannot be written fails instead of succeeding quietly')
    check(/still here|refresh|obligation/i.test(message), 'and the error is one an editor can act on', message.slice(0, 160))
    check((await titleOf(article.id)) === titleBefore, 'the content rolled back with it')
    check((await jobs()).length === 0, 'and no obligation was left behind')

    // ---------------------------------------------------------------------
    // 5. A slug change invalidates the old URL as well as the new one.
    // ---------------------------------------------------------------------
    await other.query('DELETE FROM refresh_jobs')
    receiver.reset()

    const oldPath = await pathOf(article.id)
    await payload.update({
      collection: 'articles',
      id: article.id,
      data: { slug: `${article.slug}-readiness` },
      overrideAccess: true,
    })
    await drainRefreshJobs(other as never, { concurrency: 4 })

    const newPath = await pathOf(article.id)
    const invalidated = receiver.allPaths()
    check(newPath !== oldPath, 'the rename changed the public path', `${oldPath} -> ${newPath}`)
    check(invalidated.has(oldPath), 'the old URL was invalidated', [...invalidated].join(', '))
    check(invalidated.has(newPath), 'the new URL was invalidated')

    // Put it back, so the copy stays usable for a second run.
    await payload.update({
      collection: 'articles',
      id: article.id,
      data: { slug: article.slug, title: article.title },
      overrideAccess: true,
    })
    await drainRefreshJobs(other as never, { concurrency: 4 })

    // ---------------------------------------------------------------------
    // 6. Reference locks still hold, and an article nothing points at really
    //    does leave search when it is unpublished.
    // ---------------------------------------------------------------------
    await other.query('DELETE FROM refresh_jobs')
    receiver.reset()

    let lockMessage = ''
    try {
      await payload.update({ collection: 'articles', id: article.id, data: { status: 'draft' }, overrideAccess: true })
      await payload.update({ collection: 'articles', id: article.id, data: { status: 'published' }, overrideAccess: true })
      await drainRefreshJobs(other as never, { concurrency: 4 })
    } catch (error) {
      lockMessage = error instanceof Error ? error.message : String(error)
    }

    if (lockMessage) {
      check(/curated homepage/i.test(lockMessage), 'a referenced article still cannot be unpublished', lockMessage.slice(0, 120))
      check(Boolean(await searchRow(article.id)), 'and the rejected unpublish left the search row alone')
    }

    const candidates = (
      await other.query(`SELECT id FROM articles WHERE status = 'published' AND id <> $1 ORDER BY id`, [article.id])
    ).rows as Array<{ id: number }>

    let unreferenced: number | null = null
    for (const candidate of candidates) {
      try {
        await payload.update({ collection: 'articles', id: candidate.id, data: { status: 'draft' }, overrideAccess: true })
        unreferenced = candidate.id
        break
      } catch {
        // Referenced by a curated homepage; try the next one.
      }
    }

    if (unreferenced === null) {
      check(false, 'the working copy has an unreferenced published article', 'every published article is referenced')
    } else {
      await drainRefreshJobs(other as never, { concurrency: 4 })
      check(!(await searchRow(unreferenced)), `unpublishing article ${unreferenced} removes its search row`)

      await payload.update({ collection: 'articles', id: unreferenced, data: { status: 'published' }, overrideAccess: true })
      await drainRefreshJobs(other as never, { concurrency: 4 })
      check(Boolean(await searchRow(unreferenced)), 'republishing brings it back in one edit, with no manual rebuild')
    }
  } finally {
    await other.query('DROP TRIGGER IF EXISTS readiness_break_outbox ON refresh_jobs').catch(() => {})
    await other.end()
    await receiver.close()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`)
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map((entry) => entry.label).join('; ')}`)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error)
    process.exit(1)
  })
