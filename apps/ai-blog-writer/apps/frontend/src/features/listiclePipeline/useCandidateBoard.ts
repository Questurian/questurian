import { useCallback, useEffect, useState } from 'react'
import { loadBoard, resolveDuplicates, restoreCandidate } from './api'
import type { ListicleBoard } from './types'

/**
 * The operator's duplicate decisions for the run on screen.
 *
 * Kept apart from the search results on purpose. The results are what the
 * searches found and never change because of this; the board is what the
 * operator decided about them, laid over the top.
 */

const EMPTY: ListicleBoard = { removed: [], distinct_pairs: [] }

export function useCandidateBoard(runId: string) {
  const [board, setBoard] = useState<ListicleBoard>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setBoard(EMPTY)
    void loadBoard(runId)
      .then(found => {
        if (live) setBoard(found)
      })
      .catch(caught => {
        if (live) setError(caught instanceof Error ? caught.message : 'The duplicate decisions could not be read.')
      })
    return () => {
      live = false
    }
  }, [runId])

  const save = useCallback(
    async (work: () => Promise<ListicleBoard>): Promise<boolean> => {
      setSaving(true)
      setError(null)
      try {
        setBoard(await work())
        return true
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That could not be saved.')
        return false
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const resolve = useCallback(
    (answer: { candidate_id: string; same: string[]; different: string[]; keep: string }) =>
      save(() => resolveDuplicates(runId, answer)),
    [runId, save],
  )

  const restore = useCallback(
    (candidateId: string) => save(() => restoreCandidate(runId, candidateId)),
    [runId, save],
  )

  return { board, saving, error, resolve, restore }
}
