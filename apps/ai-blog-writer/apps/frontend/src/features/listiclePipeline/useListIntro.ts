import { useCallback, useEffect, useState } from 'react'
import { loadListIntro, saveListIntro } from './api'
import type { ListIntro } from './types'

/** The list's intro, read again whenever the board or Location Manager's
 *  answer changes: either can lock, unlock or outdate it. */
export function useListIntro(runId: string, ...changes: unknown[]) {
  const [intro, setIntro] = useState<ListIntro | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setIntro(await loadListIntro(runId))
      setError('')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The intro could not be read.'
      )
    }
  }, [runId])

  // The board and Location Manager settle in a burst on load; each read asks
  // Location Manager again, so one read after the burst is enough.
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...changes])

  const save = useCallback(
    async (text: string) => {
      if (!intro) return false
      try {
        setIntro(await saveListIntro(runId, { version: intro.version, text }))
        setError('')
        return true
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'The intro could not be saved.'
        )
        void refresh()
        return false
      }
    },
    [intro, runId, refresh]
  )

  return { intro, error, save }
}
