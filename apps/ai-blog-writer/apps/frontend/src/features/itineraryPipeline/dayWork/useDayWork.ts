import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ConflictError,
  NotFoundError,
  acceptDirection,
  answerGrill,
  applyImport,
  attemptKey,
  createExport,
  createWorkspace,
  draftApprovalIsCurrent,
  prepareDirection,
  previewImport,
  readDay,
  readWorkspace,
  reopenGrill,
  requestRevision,
  setupPayload,
  startGrill,
  startResearch,
  swapPick,
  updateSetup,
} from './api'
import type { DayWorkView, ImportPreview, WorkspaceView } from './types'
import type { ItinerarySetupDraft } from '../types'

/**
 * The day workflow, driven by the server and addressed by workspace and day.
 *
 * There is no local copy of the conversation, the direction, the prompt or the
 * result. Every move posts and replaces the whole day with what came back. The
 * work lives on the workspace, so a closed tab is not a lost interview — the
 * same reason the article and listicle interviews persist per turn.
 *
 * Three things this hook is careful about, and all three are failures a
 * resumable screen adds that a disposable one never had.
 *
 * **A response never lands on the wrong day.** Every async callback checks
 * which day is on screen before it writes. Switching days during a slow turn
 * used to be how one day's answer arrived on another day's screen.
 *
 * **Opening never spends.** Reading a day is a GET, and a reload must not
 * offer to buy the interview again. The handoff that creates the workspace is
 * triggered by Start, never by arriving.
 *
 * **One key per intent.** An attempt key is minted when the operator decides,
 * and reused by every retry of that decision, so a double-click or a retry
 * after a timeout cannot buy the turn twice.
 *
 * **Setup edits reach the server on their own.** Changing a hotel or a note
 * after a proposal exists has to show up as "this changed" without waiting for
 * the next paid move, so a linked draft is pushed (debounced) whenever what it
 * would send changes. Pushing an unchanged setup is a no-op on the server.
 */

type Busy =
  | null
  | 'linking'
  | 'reading'
  | 'grill'
  | 'direction'
  | 'export'
  | 'research'
  | 'preview'
  | 'apply'
  | 'swap'

/**
 * How often the day is re-read while research is running.
 *
 * A research run is minutes of searching and reading, so this is deliberately
 * slow: the operator is watching a step that cannot finish sooner for being
 * asked about more often, and every poll is a request.
 */
const RESEARCH_POLL_MS = 5_000

/** How long setup edits settle before they are pushed. */
const SETUP_SYNC_MS = 700

/** What each workspace was last sent, across remounts of this screen. */
const pushedSetups = new Map<string, string>()

export interface UseDayWork {
  /** The workspace this draft is linked to, once it exists. */
  workspaceId: string | null
  day: DayWorkView | null
  /** Every day at a glance, once the workspace exists. */
  trip: WorkspaceView | null
  /** What is happening, specific enough to say which button to disable. */
  busy: Busy
  /** True while a model call is out. These are the only moves that cost. */
  spending: boolean
  /** True while this day's research is running, here or in another tab. */
  researching: boolean
  error: string | null
  /** The day has never been handed to the backend. Start is what does that. */
  unlinked: boolean
  preview: ImportPreview | null
  dismissError: () => void
  start: () => void
  answer: (text: string) => void
  reopen: () => void
  prepareDirection: () => void
  accept: (revision: number) => void
  buildPrompt: () => void
  research: () => void
  runPreview: (raw: string) => void
  clearPreview: () => void
  apply: (raw: string, contentHash: string) => void
  /** Ask for a changed proposal. Spends, like choosing places. */
  revise: (change: string, slotId?: string) => void
  /** Put the editor's own place in a stop. Free. */
  swap: (slotId: string, name: string, area: string, reason: string) => void
}

export function useDayWork(
  draft: ItinerarySetupDraft,
  dayId: string | null,
  onLinked: (workspaceId: string) => void,
): UseDayWork {
  const [day, setDay] = useState<DayWorkView | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [trip, setTrip] = useState<WorkspaceView | null>(null)

  const workspaceId = draft.workspaceId ?? null

  // Which day this screen is currently showing, read inside every async
  // callback before it writes.
  const showing = useRef<string | null>(dayId)
  showing.current = dayId

  // The draft as it stands, read by callbacks without making every one of them
  // depend on it — a new draft object on every keystroke would otherwise
  // rebuild every callback and re-run the read effect below.
  const draftRef = useRef(draft)
  draftRef.current = draft

  const onLinkedRef = useRef(onLinked)
  onLinkedRef.current = onLinked

  /**
   * How many times a move has written a day, and how many are still out.
   *
   * Reading a day and answering a turn race each other by design: a read
   * returns in milliseconds and a turn takes twenty seconds. Linking the
   * workspace starts the read, so a Start click has both in the air at once,
   * and whichever lands last wins. If that is the read, it lands a day with no
   * interview on top of the conversation that just started.
   *
   * So a read discards itself if a move has written, or is about to write,
   * since it began. The turn is the thing that changed something; the read
   * only ever describes what was already there.
   */
  const writes = useRef(0)
  const movesInFlight = useRef(0)

  const spending = busy === 'grill' || busy === 'direction' || busy === 'research'

  /** The whole-trip view. A read; a failure leaves the last one standing. */
  const refreshTrip = useCallback(async (id: string) => {
    try {
      const found = await readWorkspace(id)
      if (Array.isArray(found?.days)) setTrip(found)
    } catch {
      // The day itself is what matters on this screen; the overview can wait.
    }
  }, [])
  // Read off the day rather than off this screen's own state: a run started in
  // another tab, or before a reload, is still running and still costs. A run
  // that stalled is not running — leaving it counted as such would disable the
  // button for good on a day nothing is happening to.
  const researching =
    day?.research?.state === 'running' && !day.research.stalled

  const run = useCallback(
    async (kind: Busy, targetDay: string | null, work: () => Promise<DayWorkView>) => {
      setBusy(kind)
      setError(null)
      movesInFlight.current += 1
      try {
        const next = await work()
        if (targetDay !== null && showing.current !== targetDay) return
        writes.current += 1
        setDay(next)
        if (next?.workspace_id) void refreshTrip(next.workspace_id)
      } catch (caught) {
        if (targetDay !== null && showing.current !== targetDay) return
        // Said on the screen rather than swallowed: a failed turn leaves the
        // day exactly where it was, and the operator has to be able to tell
        // that apart from a turn that simply had nothing to say.
        setError(caught instanceof Error ? caught.message : 'That did not go through.')
      } finally {
        movesInFlight.current -= 1
        setBusy(current => (current === kind ? null : current))
      }
    },
    [refreshTrip],
  )

  // Read the day whenever the workspace or the day changes. A read costs
  // nothing and never starts anything.
  useEffect(() => {
    if (!workspaceId || !dayId) {
      setDay(null)
      setPreview(null)
      return
    }
    void refreshTrip(workspaceId)
    let live = true
    const startedAt = writes.current
    setBusy('reading')
    setError(null)
    setPreview(null)
    void (async () => {
      try {
        const found = await readDay(workspaceId, dayId)
        if (!live || showing.current !== dayId) return
        // A move wrote while this read was out, or is still writing. Its answer
        // is the newer one; this one describes the day before it happened.
        if (writes.current !== startedAt || movesInFlight.current > 0) return
        setDay(found)
      } catch (caught) {
        if (!live || showing.current !== dayId) return
        if (caught instanceof NotFoundError) {
          // The workspace or day is gone. Not an error to shout about: the
          // screen falls back to offering a fresh start.
          setDay(null)
        } else {
          setError(
            caught instanceof Error ? caught.message : 'That day could not be read.',
          )
        }
      } finally {
        if (live) setBusy(current => (current === 'reading' ? null : current))
      }
    })()
    return () => {
      live = false
    }
  }, [workspaceId, dayId, refreshTrip])

  // Push setup edits made while linked. Re-read only when the server says the
  // setup actually moved: an unchanged push changes nothing worth a read.
  const setupSignature = workspaceId ? JSON.stringify(setupPayload(draft)) : ''
  useEffect(() => {
    if (!workspaceId || !setupSignature) return
    if (pushedSetups.get(workspaceId) === setupSignature) return
    const timer = setTimeout(() => {
      void (async () => {
        const known = draftRef.current
        try {
          const before = trip?.revision ?? day?.workspace_revision
          const result = await updateSetup(workspaceId, known, null)
          pushedSetups.set(workspaceId, setupSignature)
          const moved = typeof result?.revision === 'number' && result.revision !== before
          if (!moved || movesInFlight.current > 0) return
          if (Array.isArray(result.days)) setTrip(result)
          const target = showing.current
          if (!target) return
          const found = await readDay(workspaceId, target)
          if (showing.current === target && movesInFlight.current === 0) setDay(found)
        } catch {
          // Another tab moved it, or the server is away. The next move pushes
          // the setup again before it asks anything.
        }
      })()
    }, SETUP_SYNC_MS)
    return () => clearTimeout(timer)
    // `day` and `trip` are read for the revision only; a new one must not
    // restart the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, setupSignature])

  /**
   * Hand the setup to the backend, once, and remember where it went.
   *
   * Called by Start rather than by arriving, because creating a workspace is a
   * decision and opening a screen is not. The local draft is marked as linked
   * only after the server has confirmed — a pointer written optimistically is
   * a pointer to something that may not exist.
   */
  const ensureLinked = useCallback(async (): Promise<string> => {
    const current = draftRef.current
    if (current.workspaceId) {
      // Already linked. Push whatever the setup says now, so a layout edited
      // since the handoff reaches the backend before anything is asked of it.
      try {
        await updateSetup(current.workspaceId, current, null)
        pushedSetups.set(current.workspaceId, JSON.stringify(setupPayload(current)))
      } catch (caught) {
        if (!(caught instanceof ConflictError)) throw caught
        // Another tab moved it. Its version is the one that exists; this one
        // re-reads rather than overwriting what it has not seen.
      }
      return current.workspaceId
    }
    setBusy('linking')
    const workspace = await createWorkspace(current)
    onLinkedRef.current(workspace.workspace_id)
    return workspace.workspace_id
  }, [])

  const start = useCallback(() => {
    if (!dayId) return
    if (!draftApprovalIsCurrent(draftRef.current)) {
      setError(
        'Every layout needs to be approved as it currently stands before a day ' +
          'can be interviewed.',
      )
      return
    }
    const key = attemptKey()
    void run('grill', dayId, async () => {
      const workspace = await ensureLinked()
      return startGrill(workspace, dayId, key)
    })
  }, [dayId, ensureLinked, run])

  const answer = useCallback(
    (text: string) => {
      if (!dayId || !workspaceId || !text.trim()) return
      const key = attemptKey()
      void run('grill', dayId, () => answerGrill(workspaceId, dayId, text.trim(), key))
    },
    [dayId, run, workspaceId],
  )

  const reopen = useCallback(() => {
    if (!dayId || !workspaceId) return
    const key = attemptKey()
    void run('grill', dayId, () => reopenGrill(workspaceId, dayId, key))
  }, [dayId, run, workspaceId])

  const prepare = useCallback(() => {
    if (!dayId || !workspaceId) return
    const key = attemptKey()
    void run('direction', dayId, () => prepareDirection(workspaceId, dayId, key))
  }, [dayId, run, workspaceId])

  const accept = useCallback(
    (revision: number) => {
      if (!dayId || !workspaceId) return
      void run('direction', dayId, () => acceptDirection(workspaceId, dayId, revision))
    },
    [dayId, run, workspaceId],
  )

  /**
   * Re-read the day while its research is running.
   *
   * A read costs nothing and starts nothing, so this is safe to leave on; it
   * stops the moment the run stops. The alternative — waiting on the POST —
   * cannot work: the browser gives up minutes before the research does.
   */
  useEffect(() => {
    if (!researching || !workspaceId || !dayId) return
    let live = true
    const timer = setInterval(() => {
      void (async () => {
        try {
          const found = await readDay(workspaceId, dayId)
          if (!live || showing.current !== dayId) return
          if (movesInFlight.current > 0) return
          setDay(found)
        } catch {
          // A failed poll is not worth shouting about. The next one is five
          // seconds away, and the run is unaffected either way.
        }
      })()
    }, RESEARCH_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [researching, workspaceId, dayId])

  const research = useCallback(() => {
    if (!dayId || !workspaceId) return
    const key = attemptKey()
    void run('research', dayId, () => startResearch(workspaceId, dayId, key))
  }, [dayId, run, workspaceId])

  const buildPrompt = useCallback(() => {
    if (!dayId) return
    void run('export', dayId, async () => {
      const workspace = await ensureLinked()
      return createExport(workspace, dayId)
    })
  }, [dayId, ensureLinked, run])

  const runPreview = useCallback(
    (raw: string) => {
      if (!dayId || !workspaceId || !raw.trim()) return
      const target = dayId
      setBusy('preview')
      setError(null)
      void (async () => {
        try {
          const found = await previewImport(workspaceId, target, raw)
          if (showing.current !== target) return
          setPreview(found)
        } catch (caught) {
          if (showing.current !== target) return
          setError(
            caught instanceof Error ? caught.message : 'That paste could not be read.',
          )
        } finally {
          setBusy(current => (current === 'preview' ? null : current))
        }
      })()
    },
    [dayId, workspaceId],
  )

  const apply = useCallback(
    (raw: string, contentHash: string) => {
      if (!dayId || !workspaceId) return
      const key = attemptKey()
      const target = dayId
      void run('apply', target, async () => {
        const saved = await applyImport(workspaceId, target, raw, contentHash, key)
        if (showing.current === target) setPreview(null)
        return saved
      })
    },
    [dayId, run, workspaceId],
  )

  const revise = useCallback(
    (change: string, slotId?: string) => {
      const base = day?.proposal?.revision
      if (!dayId || !workspaceId || !base || !change.trim()) return
      const key = attemptKey()
      void run('research', dayId, () =>
        requestRevision(workspaceId, dayId, { baseRevision: base, change: change.trim(), slotId }, key),
      )
    },
    [day?.proposal?.revision, dayId, run, workspaceId],
  )

  const swap = useCallback(
    (slotId: string, name: string, area: string, reason: string) => {
      const base = day?.proposal?.revision
      if (!dayId || !workspaceId || !base || !name.trim()) return
      const key = attemptKey()
      void run('swap', dayId, () =>
        swapPick(
          workspaceId,
          dayId,
          { slotId, name: name.trim(), area: area.trim(), reason: reason.trim(), expectedRevision: base },
          key,
        ),
      )
    },
    [day?.proposal?.revision, dayId, run, workspaceId],
  )

  return {
    workspaceId,
    day,
    trip,
    busy,
    spending,
    researching,
    error,
    unlinked: !workspaceId,
    preview,
    dismissError: useCallback(() => setError(null), []),
    start,
    answer,
    reopen,
    prepareDirection: prepare,
    accept,
    buildPrompt,
    research,
    runPreview,
    clearPreview: useCallback(() => setPreview(null), []),
    apply,
    revise,
    swap,
  }
}
