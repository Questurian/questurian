import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  availableLocalStorage,
  createLocalDraftRepository,
  createMemoryDraftRepository,
  type DraftRepository,
  type LoadResult,
} from './draftRepository'
import { createEmptyDraft } from './draft'
import { initialState, setupReducer, type SetupAction, type SetupState } from './setupReducer'
import { validateDraft, type DraftValidation } from './validation'
import type { ItinerarySetupDraft } from './types'

/**
 * The draft, its storage and their disagreements.
 *
 * Autosave is debounced so typing does not write on every keystroke, and
 * flushed on stage changes and on leaving the page so nothing is lost in the
 * gap. The status it reports is the truth about the last write, not an
 * optimistic guess: `saved` only appears after `save()` returned without
 * throwing.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'memory'

const AUTOSAVE_DELAY_MS = 500

export interface DraftController {
  state: SetupState
  draft: ItinerarySetupDraft
  dispatch: (action: SetupAction) => void
  validation: DraftValidation
  saveStatus: SaveStatus
  saveError: string | null
  /** False when the draft lives only in memory for this page view. */
  durable: boolean
  loading: boolean
  /** Set when saved data exists but this version of the screen cannot read it. */
  incompatible: string | null
  /** Set when another tab wrote a different draft to the same key. */
  conflict: ItinerarySetupDraft | null
  flush: () => void
  retrySave: () => void
  resetDraft: () => void
  acceptIncoming: () => void
  keepThisTab: () => void
}

export function useItineraryDraft(userId: string | null): DraftController {
  const repository = useMemo<DraftRepository>(() => {
    if (!userId) return createMemoryDraftRepository()
    const storage = availableLocalStorage()
    return storage ? createLocalDraftRepository(userId, storage) : createMemoryDraftRepository()
  }, [userId])

  const [state, dispatch] = useReducer(setupReducer, undefined, () => initialState(createEmptyDraft()))
  const [loading, setLoading] = useState(true)
  const [incompatible, setIncompatible] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ItinerarySetupDraft | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(repository.durable ? 'idle' : 'memory')
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Nothing is written until the operator has actually changed something. */
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef(state.draft)
  draftRef.current = state.draft
  const pausedRef = useRef(false)
  /**
   * A flush asked for during an event handler cannot see the dispatches made in
   * that same handler — the ref still holds the draft React has not committed
   * yet. So a flush writes what it can now and marks the next commit to write
   * immediately rather than waiting out the debounce.
   */
  const flushNextRef = useRef(false)

  // Load once per identity. A different signed-in user is a different draft,
  // never an inherited one.
  useEffect(() => {
    setLoading(true)
    setIncompatible(null)
    setConflict(null)
    dirtyRef.current = false
    pausedRef.current = false

    const result = repository.load()
    if (result.status === 'ok') {
      dispatch({ type: 'hydrate', draft: result.draft })
    } else {
      dispatch({ type: 'hydrate', draft: createEmptyDraft() })
      if (result.status === 'incompatible') setIncompatible(result.reason)
    }
    setSaveStatus(repository.durable ? 'idle' : 'memory')
    setSaveError(null)
    setLoading(false)
  }, [repository])

  const write = useCallback(
    (draft: ItinerarySetupDraft) => {
      if (!repository.durable) {
        setSaveStatus('memory')
        return
      }
      setSaveStatus('saving')
      try {
        repository.save(draft)
        setSaveStatus('saved')
        setSaveError(null)
      } catch (error) {
        setSaveStatus('error')
        setSaveError(
          error instanceof Error && error.message
            ? error.message
            : 'This browser refused to save the draft.',
        )
      }
    },
    [repository],
  )

  // Debounced autosave. Paused while a cross-tab conflict is unresolved, so the
  // other tab's draft is never quietly overwritten by this one.
  useEffect(() => {
    if (loading || !dirtyRef.current || pausedRef.current || incompatible) return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (flushNextRef.current) {
      flushNextRef.current = false
      write(draftRef.current)
      return
    }
    timerRef.current = setTimeout(() => write(draftRef.current), AUTOSAVE_DELAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.draft, loading, incompatible, write])

  const flush = useCallback(() => {
    if (!dirtyRef.current || pausedRef.current || incompatible) return
    if (timerRef.current) clearTimeout(timerRef.current)
    flushNextRef.current = true
    write(draftRef.current)
  }, [write, incompatible])

  // A closed tab is the most common way to lose the last few characters typed.
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
  }, [flush])

  // Another tab wrote this key. If nothing has been typed here, adopt it
  // quietly; if something has, stop writing and let the operator decide.
  useEffect(() => {
    return repository.subscribe((result: LoadResult) => {
      if (result.status !== 'ok') return
      if (!dirtyRef.current) {
        // Nothing to lose here, so the other tab's version simply becomes this
        // tab's version. No question worth asking.
        dispatch({ type: 'hydrate', draft: result.draft })
        return
      }
      pausedRef.current = true
      setConflict(result.draft)
    })
  }, [repository])

  const wrappedDispatch = useCallback((action: SetupAction) => {
    if (action.type !== 'hydrate') dirtyRef.current = true
    dispatch(action)
  }, [])

  const resetDraft = useCallback(() => {
    repository.clear()
    dirtyRef.current = false
    pausedRef.current = false
    setConflict(null)
    setIncompatible(null)
    setSaveStatus(repository.durable ? 'idle' : 'memory')
    setSaveError(null)
    dispatch({ type: 'hydrate', draft: createEmptyDraft() })
  }, [repository])

  const acceptIncoming = useCallback(() => {
    if (!conflict) return
    dispatch({ type: 'hydrate', draft: conflict })
    dirtyRef.current = false
    pausedRef.current = false
    setConflict(null)
  }, [conflict])

  const keepThisTab = useCallback(() => {
    pausedRef.current = false
    setConflict(null)
    write(draftRef.current)
  }, [write])

  const retrySave = useCallback(() => {
    write(draftRef.current)
  }, [write])

  const validation = useMemo(() => validateDraft(state.draft), [state.draft])

  return {
    state,
    draft: state.draft,
    dispatch: wrappedDispatch,
    validation,
    saveStatus,
    saveError,
    durable: repository.durable,
    loading,
    incompatible,
    conflict,
    flush,
    retrySave,
    resetDraft,
    acceptIncoming,
    keepThisTab,
  }
}
