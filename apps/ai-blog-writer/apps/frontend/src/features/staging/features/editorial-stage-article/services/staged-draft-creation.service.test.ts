/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./editorial-stage-storage.service', () => ({
  getAllStagedArticles: vi.fn(),
  upsertStagedArticle: vi.fn(),
}))

import { getAllStagedArticles, upsertStagedArticle } from './editorial-stage-storage.service'
import {
  buildRunStagedId,
  createStagedArticleForRun,
  findStagedArticleByRunId,
} from './staged-draft-creation.service'
import type { StagedArticle } from '../../../types'

const STORAGE_KEY = 'prompt2blog_staged_articles'
const RUN_ID = 'run-123'

function makeDraft(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: buildRunStagedId(RUN_ID),
    runId: RUN_ID,
    originalTitle: 'Lima cafes',
    originalContent: 'Body',
    originalType: 'guide',
    title: 'Lima cafes',
    content: 'Body',
    blocks: [],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    editorModelName: 'gemini-2.5-pro',
    step1_complete: false,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    seoSection: {} as StagedArticle['seoSection'],
    syncBehavior: 'finalize',
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  } as StagedArticle
}

const mockedGetAll = vi.mocked(getAllStagedArticles)
const mockedUpsert = vi.mocked(upsertStagedArticle)

/** Resolves only once `release()` is called, so two callers can be interleaved. */
function deferred<T>() {
  let release: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release: (value: T) => release(value) }
}

describe('createStagedArticleForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpsert.mockImplementation(async (_key, draft) => draft)
  })

  it('creates one draft when two bootstrap passes race for the same run', async () => {
    // Both passes list drafts before either write lands — what StrictMode's
    // double-invoked effect does, and what used to produce two saved articles.
    const listing = deferred<StagedArticle[]>()
    mockedGetAll.mockReturnValue(listing.promise)

    const buildDraft = vi.fn(async (stagedId: string) => makeDraft({ id: stagedId }))

    const first = createStagedArticleForRun({ storageKey: STORAGE_KEY, runId: RUN_ID, buildDraft })
    const second = createStagedArticleForRun({ storageKey: STORAGE_KEY, runId: RUN_ID, buildDraft })

    listing.release([])
    const [firstDraft, secondDraft] = await Promise.all([first, second])

    expect(buildDraft).toHaveBeenCalledTimes(1)
    expect(mockedUpsert).toHaveBeenCalledTimes(1)
    expect(firstDraft.id).toBe(secondDraft.id)
  })

  it('derives the draft id from the run id so duplicate writes hit one row', async () => {
    mockedGetAll.mockResolvedValue([])

    const draft = await createStagedArticleForRun({
      storageKey: STORAGE_KEY,
      runId: RUN_ID,
      buildDraft: async (stagedId) => makeDraft({ id: stagedId }),
    })

    expect(draft.id).toBe(buildRunStagedId(RUN_ID))
    expect(mockedUpsert).toHaveBeenCalledWith(STORAGE_KEY, expect.objectContaining({ id: draft.id }))
  })

  it('returns the stored draft instead of creating a second one for the same run', async () => {
    const existing = makeDraft({ id: 'staged_1753000000000', title: 'Edited title' })
    mockedGetAll.mockResolvedValue([existing])

    const buildDraft = vi.fn(async (stagedId: string) => makeDraft({ id: stagedId }))
    const draft = await createStagedArticleForRun({ storageKey: STORAGE_KEY, runId: RUN_ID, buildDraft })

    expect(draft).toBe(existing)
    expect(buildDraft).not.toHaveBeenCalled()
    expect(mockedUpsert).not.toHaveBeenCalled()
  })

  it('does not create a shared draft across different runs', async () => {
    mockedGetAll.mockResolvedValue([])
    const buildDraft = vi.fn(async (stagedId: string) => makeDraft({ id: stagedId }))

    const [a, b] = await Promise.all([
      createStagedArticleForRun({ storageKey: STORAGE_KEY, runId: 'run-a', buildDraft }),
      createStagedArticleForRun({ storageKey: STORAGE_KEY, runId: 'run-b', buildDraft }),
    ])

    expect(a.id).not.toBe(b.id)
    expect(mockedUpsert).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight entry so a failed creation can be retried', async () => {
    mockedGetAll.mockResolvedValue([])

    await expect(
      createStagedArticleForRun({
        storageKey: STORAGE_KEY,
        runId: RUN_ID,
        buildDraft: async () => {
          throw new Error('Unable to load article content for staging')
        },
      }),
    ).rejects.toThrow('Unable to load article content for staging')

    const retried = await createStagedArticleForRun({
      storageKey: STORAGE_KEY,
      runId: RUN_ID,
      buildDraft: async (stagedId) => makeDraft({ id: stagedId }),
    })

    expect(retried.id).toBe(buildRunStagedId(RUN_ID))
  })
})

describe('findStagedArticleByRunId', () => {
  it('returns null when no draft matches the run', () => {
    expect(findStagedArticleByRunId([makeDraft({ runId: 'other' })], RUN_ID)).toBeNull()
  })

  it('finds the draft staged from the run', () => {
    const match = makeDraft()
    expect(findStagedArticleByRunId([makeDraft({ runId: 'other' }), match], RUN_ID)).toBe(match)
  })
})
