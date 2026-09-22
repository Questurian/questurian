import { createStore } from 'zustand/vanilla'

/**
 * The bookmark store's logic, free of the network and of React so node:test
 * can drive it (`bookmarkStoreCore.test.mjs`). `bookmarkStore.ts` binds it to
 * the real services and to the page's identity store.
 *
 * Three rules this exists to keep (discovery finding 7):
 *
 *  - **Unknown is not signed out.** A refs request that fails leaves the
 *    store in `error` with `authenticated: null`. The old store set `ready`
 *    with its initial `authenticated: false`, so a signed-in reader whose
 *    refs read hit an overloaded backend was treated as a guest: every
 *    bookmark click opened the sign-in modal.
 *  - **A late answer for a previous reader cannot land.** Every load and
 *    write records the store's generation; `resetForNewReader()` bumps it, so
 *    a response that started before sign-in or sign-out is dropped.
 *  - **Recovery without a reload.** An explicit `reload()`, a reader change,
 *    or a successful write (which proves the session) re-reads the refs.
 *    Nothing retries automatically in a loop.
 */

export type RefKey = string

export type BookmarkStoreStatus = 'idle' | 'loading' | 'ready' | 'error'

export type BookmarkCoreState<Ref> = {
  refs: Set<RefKey>
  status: BookmarkStoreStatus
  pending: Set<RefKey>
  /**
   * Whether the reader has a session, as reported by the refs endpoint.
   * `null` means not known — before the first answer, or after a failure.
   *
   * An empty `refs` cannot answer this on its own: a signed-out reader and a
   * signed-in reader with nothing saved both have none. Knowing which is what
   * keeps a signed-out click from optimistically filling the control in and
   * then emptying it again when the write comes back 401.
   */
  authenticated: boolean | null
  /** Bumped on every reader change; stale responses compare against it. */
  generation: number

  /** Fetch once per page. Safe to call from every mounted control. */
  ensureLoaded: () => Promise<void>
  /** Re-read the refs, e.g. after sign-in or on an explicit retry. */
  reload: () => Promise<void>
  /** Forget everything about the previous reader, then re-read if anything is showing. */
  resetForNewReader: () => Promise<void>
  isBookmarked: (ref: Ref) => boolean
  isPending: (ref: Ref) => boolean
  /**
   * Returns `'unauthenticated'` when the write was refused for want of a
   * session, so the caller can open the login modal and replay the intent.
   * No automatic retry: a write is not repeated unless the reader repeats it.
   */
  toggle: (ref: Ref, next: boolean) => Promise<'ok' | 'unauthenticated' | 'error'>
}

export type BookmarkCoreDeps<Ref> = {
  keyOf: (ref: Ref) => RefKey
  fetchRefs: () => Promise<{ authenticated: boolean; refs: Ref[] }>
  create: (ref: Ref) => Promise<void>
  remove: (ref: Ref) => Promise<void>
  /** True when the error is the server saying "no session" (401). */
  isUnauthorized: (error: unknown) => boolean
}

export function createBookmarkStore<Ref>(deps: BookmarkCoreDeps<Ref>) {
  let loading: { generation: number; promise: Promise<void> } | null = null
  // Whether any control has asked for refs on this page. A reader change
  // re-reads only if something is showing bookmark state.
  let wanted = false

  return createStore<BookmarkCoreState<Ref>>()((set, get) => {
    const load = (): Promise<void> => {
      const generation = get().generation
      if (loading && loading.generation === generation) return loading.promise

      set({ status: 'loading' })
      const promise = (async () => {
        try {
          const { authenticated, refs } = await deps.fetchRefs()
          if (get().generation !== generation) return
          set({ refs: new Set(refs.map(deps.keyOf)), authenticated, status: 'ready' })
        } catch {
          if (get().generation !== generation) return
          // Not "signed out", not "nothing saved": we do not know.
          set({ status: 'error', authenticated: null })
        } finally {
          if (loading?.generation === generation) loading = null
        }
      })()
      loading = { generation, promise }
      return promise
    }

    return {
      refs: new Set<RefKey>(),
      status: 'idle',
      pending: new Set<RefKey>(),
      authenticated: null,
      generation: 0,

      ensureLoaded: async () => {
        wanted = true
        // `error` stays until something deliberate retries it, so a page of
        // forty controls does not turn one failure into forty requests.
        if (get().status !== 'idle') return loading?.promise
        return load()
      },

      reload: async () => {
        wanted = true
        set({ status: 'idle' })
        return load()
      },

      resetForNewReader: async () => {
        loading = null
        set((state) => ({
          refs: new Set<RefKey>(),
          pending: new Set<RefKey>(),
          authenticated: null,
          status: 'idle',
          generation: state.generation + 1,
        }))
        if (wanted) await load()
      },

      isBookmarked: (ref) => get().refs.has(deps.keyOf(ref)),

      isPending: (ref) => get().pending.has(deps.keyOf(ref)),

      toggle: async (ref, next) => {
        const key = deps.keyOf(ref)

        // Known signed out: say so before touching the icon. The optimistic
        // update below is right for a reader whose write will succeed and
        // wrong for one whose will not. When the state is *unknown* the
        // server decides — it is the only thing that actually knows.
        if (get().status === 'ready' && get().authenticated === false) {
          return 'unauthenticated'
        }

        const generation = get().generation
        const had = get().refs.has(key)

        set((state) => {
          const refs = new Set(state.refs)
          if (next) refs.add(key)
          else refs.delete(key)
          return { refs, pending: new Set(state.pending).add(key) }
        })

        const settle = (restore: boolean) =>
          set((state) => {
            if (state.generation !== generation) return {}
            const pending = new Set(state.pending)
            pending.delete(key)
            if (!restore) return { pending }
            // Roll back this key only; a concurrent toggle of another
            // control keeps its own outcome.
            const refs = new Set(state.refs)
            if (had) refs.add(key)
            else refs.delete(key)
            return { pending, refs }
          })

        try {
          if (next) await deps.create(ref)
          else await deps.remove(ref)
          if (get().generation !== generation) return 'ok'
          settle(false)
          // A write proves the session in a way the cached flag cannot. If the
          // refs were unknown, this is the moment to learn them.
          const wasUnknown = get().status === 'error'
          if (get().authenticated !== true) set({ authenticated: true })
          if (wasUnknown) void load()
          return 'ok'
        } catch (error) {
          settle(true)
          if (get().generation !== generation) return 'error'
          if (deps.isUnauthorized(error)) {
            set({ authenticated: false })
            return 'unauthenticated'
          }
          return 'error'
        }
      },
    }
  })
}
