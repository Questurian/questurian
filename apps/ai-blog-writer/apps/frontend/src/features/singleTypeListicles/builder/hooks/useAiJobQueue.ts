import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  GenerateListicleContentResponse,
  ListicleStepEvent,
} from '../../../staging/api'
import { useSerialTaskQueue } from '../../../../shared/hooks/useSerialTaskQueue'

export const AUTO_WRITE_EMPTY_FIELDS_JOB_ID = '__auto_write_empty_fields__'

type AiJobVisualState = 'queued' | 'running'

export function useAiJobQueue() {
  const [visualStateById, setVisualStateById] = useState<Record<string, AiJobVisualState>>({})
  const [stepsByTargetId, setStepsByTargetId] = useState<Record<string, ListicleStepEvent[]>>({})
  const [inspectTarget, setInspectTarget] = useState<
    { targetId: string; label: string; openedAutomatically: boolean } | null
  >(null)
  const clearTimersRef = useRef<Record<string, number>>({})
  const {
    activeTaskId,
    queuedTaskIds,
    enqueueTask,
  } = useSerialTaskQueue<string>()

  useEffect(() => {
    return () => {
      Object.values(clearTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      clearTimersRef.current = {}
    }
  }, [])

  const recordResponseSteps = useCallback((response: GenerateListicleContentResponse) => {
    setStepsByTargetId((current) => {
      const next = { ...current }
      for (const [targetId, entry] of Object.entries(response.results)) {
        if (entry?.steps && entry.steps.length > 0) {
          next[targetId] = entry.steps
        }
      }
      return next
    })
  }, [])

  const openInspect = useCallback(
    (targetId: string, label: string, openedAutomatically = false) => {
      setStepsByTargetId((current) => {
        if (!openedAutomatically || !(targetId in current)) return current
        const next = { ...current }
        delete next[targetId]
        return next
      })
      setInspectTarget({ targetId, label, openedAutomatically })
    },
    [],
  )

  const closeInspect = useCallback(() => {
    setInspectTarget(null)
  }, [])

  const markVisualState = useCallback((jobId: string, state: AiJobVisualState) => {
    const existingTimer = clearTimersRef.current[jobId]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      delete clearTimersRef.current[jobId]
    }

    setVisualStateById((current) => ({
      ...current,
      [jobId]: state,
    }))
  }, [])

  const clearVisualState = useCallback((jobId: string) => {
    const existingTimer = clearTimersRef.current[jobId]
    if (existingTimer) {
      window.clearTimeout(existingTimer)
    }

    clearTimersRef.current[jobId] = window.setTimeout(() => {
      setVisualStateById((current) => {
        const next = { ...current }
        delete next[jobId]
        return next
      })
      delete clearTimersRef.current[jobId]
    }, 900)
  }, [])

  return {
    activeTaskId,
    queuedTaskIds,
    enqueueTask,
    visualStateById,
    stepsByTargetId,
    inspectTarget,
    recordResponseSteps,
    openInspect,
    closeInspect,
    markVisualState,
    clearVisualState,
  }
}
