import { DRAFT_SCHEMA_VERSION, type ItinerarySetupDraft } from './types'

/**
 * Where a draft is kept, behind an interface.
 *
 * Today that is this browser's `localStorage`, scoped to the signed-in Staff
 * id. That is the honest ceiling of a frontend-only build, and the UI says so
 * in those words — "Saved on this browser" — rather than implying a run exists
 * somewhere. When server persistence arrives it replaces
 * `createLocalDraftRepository` and nothing above this file has to change.
 *
 * Three failure modes are handled rather than assumed away:
 *
 * - **No identity.** An operator tool must not hand one person's draft to the
 *   next person who opens the app, so with no user id we keep the draft in
 *   memory and say that reloading will lose it.
 * - **A write that fails.** Quota, private mode, a locked profile. The status
 *   goes to `error`; it never reads "Saved" for something that was not.
 * - **A draft from a version we cannot read.** It is left untouched and the
 *   operator is offered an explicit reset, because silently overwriting
 *   somebody's work to make a parse error go away is the worse outcome.
 */

export const STORAGE_PREFIX = 'abw.itineraryPipeline.draft.v1'

export function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; draft: ItinerarySetupDraft }
  | { status: 'incompatible'; reason: string }

export interface DraftRepository {
  /** True when a reload will still find the draft. */
  readonly durable: boolean
  readonly key: string | null
  load(): LoadResult
  /** Throws when the write does not land. Callers surface that, never swallow it. */
  save(draft: ItinerarySetupDraft): void
  clear(): void
  /** Fires when another tab writes the same key. Returns an unsubscribe. */
  subscribe(listener: (result: LoadResult) => void): () => void
}

function parse(raw: string): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'incompatible', reason: 'The saved draft could not be read.' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'incompatible', reason: 'The saved draft could not be read.' }
  }

  const candidate = parsed as Partial<ItinerarySetupDraft>
  if (candidate.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    return {
      status: 'incompatible',
      reason: `The saved draft was written by a different version of this screen (v${String(candidate.schemaVersion ?? '?')}, this is v${DRAFT_SCHEMA_VERSION}).`,
    }
  }
  if (!candidate.trip || !Array.isArray(candidate.days) || !candidate.ui) {
    return { status: 'incompatible', reason: 'The saved draft is missing parts this screen needs.' }
  }
  return { status: 'ok', draft: candidate as ItinerarySetupDraft }
}

export function createLocalDraftRepository(
  userId: string,
  storage: Storage,
): DraftRepository {
  const key = storageKeyFor(userId)

  return {
    durable: true,
    key,
    load() {
      let raw: string | null
      try {
        raw = storage.getItem(key)
      } catch {
        return { status: 'incompatible', reason: 'This browser is not letting the app read saved drafts.' }
      }
      if (!raw) return { status: 'empty' }
      return parse(raw)
    },
    save(draft) {
      storage.setItem(key, JSON.stringify(draft))
    },
    clear() {
      try {
        storage.removeItem(key)
      } catch {
        /* Clearing a store that refuses to be written is already the end state. */
      }
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {}
      const onStorage = (event: StorageEvent) => {
        // `key === null` is a whole-store clear, which concerns this draft too.
        if (event.key !== null && event.key !== key) return
        listener(event.newValue ? parse(event.newValue) : { status: 'empty' })
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
  }
}

/** Used when there is no signed-in identity to scope a saved draft to. */
export function createMemoryDraftRepository(): DraftRepository {
  let held: ItinerarySetupDraft | null = null
  return {
    durable: false,
    key: null,
    load: () => (held ? { status: 'ok', draft: held } : { status: 'empty' }),
    save(draft) {
      held = draft
    },
    clear() {
      held = null
    },
    subscribe: () => () => {},
  }
}

/** `localStorage` access itself can throw; a probe is cheaper than a crash. */
export function availableLocalStorage(): Storage | null {
  try {
    const probe = `${STORAGE_PREFIX}.probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}
