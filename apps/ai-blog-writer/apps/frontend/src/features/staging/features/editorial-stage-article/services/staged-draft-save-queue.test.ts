import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StagedDraftSaveQueue } from './staged-draft-save-queue'
import {
  StagedDraftConflictError,
  putStagedDraft,
} from '../../../api/staged-drafts/staged-drafts.api'
import type { StagedArticle } from '../../../types'

vi.mock('../../../api/staged-drafts/staged-drafts.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/staged-drafts/staged-drafts.api')>()
  return {
    ...actual,
    putStagedDraft: vi.fn(),
  }
})

const mockPut = vi.mocked(putStagedDraft)

function buildDraft(overrides?: Partial<StagedArticle>): StagedArticle {
  return {
    id: 'staged_1',
    runId: 'run_1',
    originalTitle: '',
    originalContent: '',
    originalType: '',
    title: 'Title',
    content: '',
    blocks: [],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('StagedDraftSaveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPut.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid schedules into one PUT with the latest snapshot', async () => {
    mockPut.mockResolvedValue(buildDraft({ updatedAt: 'server-1' }))
    const queue = new StagedDraftSaveQueue({
      storageKey: 'key',
      initialServerUpdatedAt: 'server-0',
      onConflict: vi.fn(),
    })

    queue.schedule(buildDraft({ title: 'a' }))
    queue.schedule(buildDraft({ title: 'ab' }))
    queue.schedule(buildDraft({ title: 'abc' }))

    await vi.advanceTimersByTimeAsync(800)

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0][1].title).toBe('abc')
    expect(mockPut.mock.calls[0][2]).toEqual({ expectedUpdatedAt: 'server-0' })
  })

  it('propagates the server updatedAt from each PUT response to the next save', async () => {
    mockPut
      .mockResolvedValueOnce(buildDraft({ updatedAt: 'server-1' }))
      .mockResolvedValueOnce(buildDraft({ updatedAt: 'server-2' }))
    const queue = new StagedDraftSaveQueue({
      storageKey: 'key',
      initialServerUpdatedAt: 'server-0',
      onConflict: vi.fn(),
    })

    queue.schedule(buildDraft({ title: 'first' }))
    await vi.advanceTimersByTimeAsync(800)

    queue.schedule(buildDraft({ title: 'second' }))
    await vi.advanceTimersByTimeAsync(800)

    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(mockPut.mock.calls[0][2]).toEqual({ expectedUpdatedAt: 'server-0' })
    expect(mockPut.mock.calls[1][2]).toEqual({ expectedUpdatedAt: 'server-1' })
  })

  it('stops the queue and reports the conflict on 409', async () => {
    const current = buildDraft({ title: 'someone elses version' })
    mockPut.mockRejectedValue(new StagedDraftConflictError(current))
    const onConflict = vi.fn()
    const queue = new StagedDraftSaveQueue({
      storageKey: 'key',
      initialServerUpdatedAt: 'server-0',
      onConflict,
    })

    queue.schedule(buildDraft({ title: 'mine' }))
    await vi.advanceTimersByTimeAsync(800)

    expect(onConflict).toHaveBeenCalledWith({ current })
    expect(queue.isStopped).toBe(true)

    // Further saves are ignored once stopped.
    queue.schedule(buildDraft({ title: 'more edits' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(mockPut).toHaveBeenCalledTimes(1)
  })

  it('flush sends a pending debounced save immediately', async () => {
    mockPut.mockResolvedValue(buildDraft({ updatedAt: 'server-1' }))
    const queue = new StagedDraftSaveQueue({
      storageKey: 'key',
      initialServerUpdatedAt: 'server-0',
      onConflict: vi.fn(),
    })

    queue.schedule(buildDraft({ title: 'pending' }))
    await queue.flush()

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut.mock.calls[0][1].title).toBe('pending')
  })

  it('reports transient errors without stopping and retries on the next save', async () => {
    const onError = vi.fn()
    mockPut
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(buildDraft({ updatedAt: 'server-1' }))
    const queue = new StagedDraftSaveQueue({
      storageKey: 'key',
      initialServerUpdatedAt: 'server-0',
      onConflict: vi.fn(),
      onError,
    })

    queue.schedule(buildDraft({ title: 'v1' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(queue.isStopped).toBe(false)

    queue.schedule(buildDraft({ title: 'v2' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(mockPut).toHaveBeenCalledTimes(2)
    expect(mockPut.mock.calls[1][1].title).toBe('v2')
  })
})
