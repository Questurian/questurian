/* @vitest-environment jsdom */
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBuilderBootstrap, type BuilderBootstrapStorage } from './useBuilderBootstrap'

type TestDraft = { draftId: string; payloadId?: number; title: string }
type TestAux = { locations: string[] }

/**
 * In-memory stand-in for the localStorage draft store. `createEmptyDraft`
 * mirrors the real `lit_${Date.now()}`/`stl_${Date.now()}` id scheme: the clock
 * advances between two bootstrap passes (they are separated by a network
 * round-trip), so each call yields a distinct id.
 */
function createTestStorage() {
  const saved = new Map<string, TestDraft>()
  let clock = 0

  const storage: BuilderBootstrapStorage<TestDraft> = {
    findDraftByPayloadId: (id) => [...saved.values()].find((draft) => draft.payloadId === id) ?? null,
    findDraftByDraftId: (id) => saved.get(id) ?? null,
    createEmptyDraft: () => ({ draftId: `draft_${(clock += 1)}`, title: '' }),
    saveDraft: (draft) => {
      saved.set(draft.draftId, draft)
    },
  }

  return { storage, saved }
}

function deferred<T>() {
  let release: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release: (value: T) => release(value) }
}

function renderBootstrap(options: {
  storage: BuilderBootstrapStorage<TestDraft>
  loadAuxData: () => Promise<TestAux>
  draftIdParam?: string | null
  payloadIdParam?: string | null
  setSearchParams?: ReturnType<typeof vi.fn>
  fetchPayloadDoc?: (id: number, token: string) => Promise<{ id: number; title: string }>
  strict?: boolean
}) {
  const setSearchParams = options.setSearchParams ?? vi.fn()
  const result = renderHook(
    () =>
      useBuilderBootstrap<TestDraft, { id: number; title: string }, TestAux>({
        token: 'test-token',
        payloadIdParam: options.payloadIdParam ?? null,
        draftIdParam: options.draftIdParam ?? null,
        setSearchParams: setSearchParams as never,
        onError: vi.fn(),
        storage: options.storage,
        loadAuxData: options.loadAuxData,
        fetchPayloadDoc: options.fetchPayloadDoc ?? (async (id) => ({ id, title: 'From Payload' })),
        payloadDocToDraft: (doc, existingDraftId) => ({
          draftId: existingDraftId ?? `payload_${doc.id}`,
          payloadId: doc.id,
          title: doc.title,
        }),
        initialAuxData: { locations: [] },
      }),
    options.strict === false ? undefined : { wrapper: StrictMode },
  )
  return { ...result, setSearchParams }
}

describe('useBuilderBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a single fresh draft when the effect is double-invoked', async () => {
    // Guards the cancel-check placement: the discarded StrictMode pass must bail
    // out right after the aux-data await, *before* createEmptyDraft/saveDraft.
    // Move that check below the create and every fresh visit saves two drafts —
    // the duplicate-drafts bug the staged-article bootstrap had.
    const { storage, saved } = createTestStorage()
    const aux = deferred<TestAux>()
    const loadAuxData = vi.fn(() => aux.promise)

    const { result, setSearchParams } = renderBootstrap({
      storage,
      loadAuxData,
    })

    // Both passes must really be in flight, or this test proves nothing.
    expect(loadAuxData).toHaveBeenCalledTimes(2)

    await act(async () => {
      aux.release({ locations: ['lima'] })
      await aux.promise
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(saved.size).toBe(1)
    expect(result.current.draft?.draftId).toBe([...saved.keys()][0])
    expect(setSearchParams).toHaveBeenCalled()
  })

  it('still resolves a draft when the first pass is discarded', async () => {
    const { storage, saved } = createTestStorage()
    const aux = deferred<TestAux>()

    const { result } = renderBootstrap({
      storage,
      loadAuxData: () => aux.promise,
    })

    await act(async () => {
      aux.release({ locations: ['lima'] })
      await aux.promise
    })

    await waitFor(() => expect(result.current.draft).not.toBeNull())
    expect(result.current.auxData.locations).toEqual(['lima'])
    expect(saved.size).toBe(1)
  })

  it('resumes an existing draft by draftId without creating another', async () => {
    const { storage, saved } = createTestStorage()
    storage.saveDraft({ draftId: 'draft_existing', title: 'Half-written' })

    const { result } = renderBootstrap({
      storage,
      loadAuxData: async () => ({ locations: [] }),
      draftIdParam: 'draft_existing',
    })

    await waitFor(() => expect(result.current.draft?.draftId).toBe('draft_existing'))
    expect(saved.size).toBe(1)
    expect(result.current.draft?.title).toBe('Half-written')
  })

  it('imports a Payload document once under double-invoked effects', async () => {
    const { storage } = createTestStorage()
    const fetchPayloadDoc = vi.fn(async (id: number) => ({ id, title: 'From Payload' }))

    const { result } = renderBootstrap({
      storage,
      loadAuxData: async () => ({ locations: [] }),
      payloadIdParam: '42',
      fetchPayloadDoc,
    })

    await waitFor(() => expect(result.current.draft?.payloadId).toBe(42))
    expect(fetchPayloadDoc).toHaveBeenCalledTimes(1)
  })
})
