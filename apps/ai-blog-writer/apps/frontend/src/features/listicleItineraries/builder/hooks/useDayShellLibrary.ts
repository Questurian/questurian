import { useCallback, useEffect, useState } from 'react'
import type { DayShellTemplate } from '../../types'
import {
  createLibraryDayShell,
  deleteLibraryDayShell,
  listLibraryDayShells,
  updateLibraryDayShell,
} from '../services/day-shell-library.api'

type UseDayShellLibraryResult = {
  libraryShells: DayShellTemplate[]
  createLibraryShell: (shell: DayShellTemplate) => Promise<void>
  updateLibraryShell: (shell: DayShellTemplate) => Promise<void>
  deleteLibraryShell: (shellId: string) => Promise<void>
}

export function useDayShellLibrary(): UseDayShellLibraryResult {
  const [libraryShells, setLibraryShells] = useState<DayShellTemplate[]>([])

  useEffect(() => {
    let cancelled = false
    listLibraryDayShells()
      .then((shells) => {
        if (!cancelled) setLibraryShells(shells)
      })
      .catch(() => {
        // Library unavailable; built-ins and draft snapshots still work.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const createLibraryShell = useCallback(async (shell: DayShellTemplate) => {
    const created = await createLibraryDayShell(shell)
    setLibraryShells((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const updateLibraryShell = useCallback(async (shell: DayShellTemplate) => {
    const updated = await updateLibraryDayShell(shell)
    setLibraryShells((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
  }, [])

  const deleteLibraryShell = useCallback(async (shellId: string) => {
    await deleteLibraryDayShell(shellId)
    setLibraryShells((current) => current.filter((entry) => entry.id !== shellId))
  }, [])

  return {
    libraryShells,
    createLibraryShell,
    updateLibraryShell,
    deleteLibraryShell,
  }
}
