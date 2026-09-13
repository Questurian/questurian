import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLocationManagerStatus, setListicleType } from './api'
import type {
  ListicleType,
  LocationManagerBoard,
  LocationManagerPlace
} from './types'

/** Location Manager's own screens. Local, like this app. */
export const LM_CLIENT_URL = (
  import.meta.env.VITE_LM_CLIENT_URL || 'http://localhost:3002'
).replace(/\/$/, '')

export const LISTICLE_TYPES: { value: ListicleType; label: string }[] = [
  { value: 'dining', label: 'Dining' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'accommodations', label: 'Accommodations' },
  { value: 'attractions', label: 'Attractions' }
]

/** Location Manager's Add form for the run's one type, opened with what this
 *  board already knows. The Google lookup is not started: it is still the
 *  operator's press. */
export function addToLocationManagerUrl(
  prefill: LocationManagerPlace['prefill'],
  listicleType: ListicleType
): string {
  const params = new URLSearchParams()
  if (prefill.name) params.set('name', prefill.name)
  if (prefill.address) params.set('address', prefill.address)
  if (prefill.tripadvisor_url)
    params.set('tripadvisorUrl', prefill.tripadvisor_url)
  return `${LM_CLIENT_URL}/add/${listicleType}?${params.toString()}`
}

export function locationManagerEditUrl(location: {
  id: number
  category: string
}): string {
  return `${LM_CLIENT_URL}/edit/${location.category}/${location.id}`
}

/** Location Manager's answer for one run, asked again whenever the operator
 *  comes back to this tab -- adding a place happens in the other one. */
export function useLocationManager(runId: string) {
  const [board, setBoard] = useState<LocationManagerBoard | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const live = useRef(true)

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const found = await loadLocationManagerStatus(runId)
      if (!live.current) return
      setBoard(found)
      setError(found.available ? '' : found.error)
    } catch (caught) {
      if (!live.current) return
      setError(
        caught instanceof Error
          ? caught.message
          : 'Location Manager could not be checked.'
      )
    } finally {
      if (live.current) setChecking(false)
    }
  }, [runId])

  useEffect(() => {
    live.current = true
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live.current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const [typeError, setTypeError] = useState('')
  const chooseType = useCallback(
    async (listicleType: ListicleType) => {
      setTypeError('')
      try {
        await setListicleType(runId, listicleType)
        await refresh()
      } catch (caught) {
        if (live.current)
          setTypeError(
            caught instanceof Error
              ? caught.message
              : 'The list type could not be saved.'
          )
      }
    },
    [runId, refresh]
  )

  const placeFor = useCallback(
    (candidateId: string): LocationManagerPlace | undefined =>
      board?.places[candidateId],
    [board]
  )

  return {
    board,
    listicleType: board?.listicle_type || undefined,
    checking,
    error,
    typeError,
    refresh,
    chooseType,
    placeFor
  }
}
