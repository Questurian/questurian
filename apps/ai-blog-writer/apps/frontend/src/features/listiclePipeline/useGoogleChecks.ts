import { useCallback, useEffect, useState } from 'react'
import {
  checkOnGoogle,
  loadGoogleChecks,
  loadPlacesAllowance,
  recheckPlaceOnGoogle,
} from './api'
import type { ListicleBoard, ListicleGoogleCheck, ListiclePlacesAllowance } from './types'

/**
 * What Google said about the places on the board.
 *
 * Read when the screen opens, which costs nothing; looked up only when the
 * operator presses the button, which is billed per place.
 */
export function useGoogleChecks(runId: string) {
  const [checks, setChecks] = useState<Record<string, ListicleGoogleCheck>>({})
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowance, setAllowance] = useState<ListiclePlacesAllowance | null>(null)

  const readAllowance = useCallback((refresh: boolean) => {
    void loadPlacesAllowance(refresh)
      .then(setAllowance)
      .catch(() =>
        setAllowance({
          available: false,
          free: 1000,
          month_start: '',
          as_of: '',
          reason: "Google's count could not be read.",
        }),
      )
  }, [])

  useEffect(() => {
    readAllowance(false)
  }, [readAllowance])

  useEffect(() => {
    let live = true
    setChecks({})
    void loadGoogleChecks(runId)
      .then(found => {
        if (!live) return
        setChecks(found.checks)
        setChecking(found.running)
      })
      .catch(caught => {
        if (live) setError(caught instanceof Error ? caught.message : 'The Google checks could not be read.')
      })
    return () => {
      live = false
    }
  }, [runId])

  const check = useCallback(async (): Promise<ListicleBoard | undefined> => {
    setChecking(true)
    setError(null)
    try {
      const found = await checkOnGoogle(runId)
      setChecks(found.checks)
      return found.board
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The places could not be checked on Google.')
      return undefined
    } finally {
      setChecking(false)
      // Google's count runs a few minutes behind, so this may not show the
      // lookups just made yet. Asked again anyway, fresh.
      readAllowance(true)
    }
  }, [runId, readAllowance])

  /** Ask again about one place whose match is wrong. One lookup. */
  const recheck = useCallback(
    async (candidateId: string): Promise<boolean> => {
      setChecking(true)
      setError(null)
      try {
        const found = await recheckPlaceOnGoogle(runId, candidateId)
        setChecks(found.checks)
        return true
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'That place could not be checked again.',
        )
        return false
      } finally {
        setChecking(false)
        readAllowance(true)
      }
    },
    [runId, readAllowance],
  )

  /** Mirror what the server records when a place Google flagged is put back
   *  -- the operator overruling Google -- so the card stops showing the flag
   *  without another read. */
  const dismiss = useCallback(
    (candidateId: string, flag: 'closed_dismissed' | 'venue_dismissed') => {
      setChecks(current =>
        current[candidateId]
          ? { ...current, [candidateId]: { ...current[candidateId], [flag]: true } }
          : current,
      )
    },
    [],
  )

  return { checks, checking, error, check, recheck, allowance, dismiss }
}
