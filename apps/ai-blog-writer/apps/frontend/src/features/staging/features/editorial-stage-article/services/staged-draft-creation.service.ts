/**
 * Idempotent creation of the staged draft that backs a pipeline run.
 *
 * The stage page's bootstrap effect can run more than once for the same run —
 * React StrictMode double-invokes it on mount, and a dependency change can
 * re-enter it while the first pass is still awaiting. The "does a draft for this
 * run already exist?" lookup is async, so both passes miss and both create,
 * which left two identical drafts in Saved Articles for a single save from the
 * pipeline.
 *
 * Two layers close that race:
 *  - the draft id is derived from the run id, so any duplicate write lands on
 *    the same server row (Payload imports already key their drafts this way);
 *  - concurrent creations for the same run share a single in-flight promise, so
 *    the run's markdown is fetched and written only once.
 */
import type { StagedArticle } from '../../../types'
import { getAllStagedArticles, upsertStagedArticle } from './editorial-stage-storage.service'

const RUN_STAGED_ID_PREFIX = 'staged_run_'

export function buildRunStagedId(runId: string): string {
  return `${RUN_STAGED_ID_PREFIX}${runId}`
}

export function findStagedArticleByRunId(
  drafts: StagedArticle[],
  runId: string,
): StagedArticle | null {
  return drafts.find((draft) => draft.runId === runId) ?? null
}

const inFlightCreations = new Map<string, Promise<StagedArticle>>()

export type CreateStagedArticleForRunInput = {
  storageKey: string
  runId: string
  /** Builds the draft body. Only called when no draft exists for the run yet. */
  buildDraft: (stagedId: string) => Promise<StagedArticle>
}

export async function createStagedArticleForRun({
  storageKey,
  runId,
  buildDraft,
}: CreateStagedArticleForRunInput): Promise<StagedArticle> {
  const dedupeKey = `${storageKey}::${runId}`
  const pending = inFlightCreations.get(dedupeKey)
  if (pending) return pending

  const creation = (async () => {
    // Re-check inside the guarded section: a caller arriving just after an
    // earlier creation settled finds the persisted draft instead of making a
    // second one.
    const existing = findStagedArticleByRunId(await getAllStagedArticles(storageKey), runId)
    if (existing) return existing
    return upsertStagedArticle(storageKey, await buildDraft(buildRunStagedId(runId)))
  })()

  inFlightCreations.set(dedupeKey, creation)
  try {
    return await creation
  } finally {
    inFlightCreations.delete(dedupeKey)
  }
}
