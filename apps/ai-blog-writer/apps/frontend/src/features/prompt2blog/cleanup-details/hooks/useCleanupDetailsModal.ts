import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPrompt2BlogDebug, type Prompt2BlogDebugStages } from '../../api'
import { readCleanupStageData } from '../cleanup-stage.parser'

interface UseCleanupDetailsModalParams {
  pipelineRunId: string | null
  pipelineDebugData: Prompt2BlogDebugStages | null
  onDebugData: (data: Prompt2BlogDebugStages) => void
}

export function useCleanupDetailsModal({
  pipelineRunId,
  pipelineDebugData,
  onDebugData,
}: UseCleanupDetailsModalParams) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const data = useMemo(() => readCleanupStageData(pipelineDebugData), [pipelineDebugData])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const open = useCallback(async () => {
    if (!pipelineRunId) return
    setIsOpen(true)
    setError(null)
    if (data) return

    setIsLoading(true)
    try {
      const debugPayload = await getPrompt2BlogDebug(pipelineRunId)
      if (debugPayload?.stages) {
        onDebugData(debugPayload.stages)
        if (!readCleanupStageData(debugPayload.stages)) {
          setError('Cleanup stage data is not available for this run yet.')
        }
      } else {
        setError('Cleanup stage data is not available for this run yet.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cleanup details.')
    } finally {
      setIsLoading(false)
    }
  }, [data, onDebugData, pipelineRunId])

  const close = useCallback(() => setIsOpen(false), [])

  return { isOpen, isLoading, error, data, open, close }
}
