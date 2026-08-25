import { useEffect, useRef, useState } from 'react'
import {
  clearRunState,
  loadSavedRunState,
  saveRunState,
} from '../pipeline-run.storage'
import type {
  PersistedPipelineResult,
  PersistedRunState,
  SourceStep,
} from '../pipeline-run.types'

export function usePersistedPipelineRunState() {
  const savedRun = useRef(loadSavedRunState())
  const [sourceStep, setSourceStep] = useState<SourceStep>(savedRun.current.sourceStep)
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(savedRun.current.pipelineRunId)
  const [pipelineResult, setPipelineResult] = useState<PersistedPipelineResult | null>(
    savedRun.current.pipelineResult,
  )

  useEffect(() => {
    const persistedState: PersistedRunState = { sourceStep, pipelineRunId, pipelineResult }
    saveRunState(persistedState)
  }, [sourceStep, pipelineRunId, pipelineResult])

  const clearPersistedRunState = () => {
    clearRunState()
  }

  return {
    savedRun,
    sourceStep,
    setSourceStep,
    pipelineRunId,
    setPipelineRunId,
    pipelineResult,
    setPipelineResult,
    clearPersistedRunState,
  }
}
