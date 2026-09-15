import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyDraft } from './draft'
import {
  createLocalDraftRepository,
  createMemoryDraftRepository,
  storageKeyFor,
} from './draftRepository'
import { DRAFT_SCHEMA_VERSION } from './types'

/**
 * Saving, and the three ways it goes wrong.
 *
 * A draft belongs to one operator, a write that fails has to say so, and data
 * written by a version we cannot read is somebody's work — not rubbish to be
 * cleared out of the way.
 */

function fakeStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  } as Storage & { map: Map<string, string> }
}

describe('the local draft repository', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
  })

  it('round-trips a draft', () => {
    const repository = createLocalDraftRepository('staff-1', storage)
    const draft = createEmptyDraft()
    draft.trip.titleSeed = 'Three easy days in Lima'
    repository.save(draft)

    const loaded = createLocalDraftRepository('staff-1', storage).load()
    expect(loaded.status).toBe('ok')
    expect(loaded.status === 'ok' && loaded.draft.trip.titleSeed).toBe('Three easy days in Lima')
  })

  it('keeps one operator out of the draft belonging to another', () => {
    createLocalDraftRepository('staff-1', storage).save(createEmptyDraft())
    expect(createLocalDraftRepository('staff-2', storage).load().status).toBe('empty')
    expect(storage.map.has(storageKeyFor('staff-1'))).toBe(true)
  })

  it('reports a failed write instead of pretending it saved', () => {
    const repository = createLocalDraftRepository('staff-1', storage)
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => repository.save(createEmptyDraft())).toThrow(/Quota/)
  })

  it('refuses to read a draft from a schema it does not know, and leaves it alone', () => {
    const foreign = { ...createEmptyDraft(), schemaVersion: DRAFT_SCHEMA_VERSION + 7 }
    storage.setItem(storageKeyFor('staff-1'), JSON.stringify(foreign))

    const result = createLocalDraftRepository('staff-1', storage).load()
    expect(result.status).toBe('incompatible')
    expect(storage.map.get(storageKeyFor('staff-1'))).toContain(String(DRAFT_SCHEMA_VERSION + 7))
  })

  it('treats unreadable text as incompatible rather than as an empty draft', () => {
    storage.setItem(storageKeyFor('staff-1'), 'not json at all')
    expect(createLocalDraftRepository('staff-1', storage).load().status).toBe('incompatible')
  })

  it('treats a draft missing its parts as incompatible', () => {
    storage.setItem(
      storageKeyFor('staff-1'),
      JSON.stringify({ schemaVersion: DRAFT_SCHEMA_VERSION, trip: {} }),
    )
    expect(createLocalDraftRepository('staff-1', storage).load().status).toBe('incompatible')
  })
})

describe('the memory repository', () => {
  it('holds a draft for this page view and says it is not durable', () => {
    const repository = createMemoryDraftRepository()
    expect(repository.durable).toBe(false)
    repository.save(createEmptyDraft())
    expect(repository.load().status).toBe('ok')
    repository.clear()
    expect(repository.load().status).toBe('empty')
  })
})
