import { useEffect, useRef, useState } from 'react'
import {
  loadSavedRunState,
  RUN_STORAGE_KEY,
} from '../pipeline-run.storage'
import type {
  PersistedRunState,
  SourceStep,
} from '../pipeline-run.types'
import type { Prompt2BlogPipelinePayload } from '../../api'

export function usePersistedPipelineRunState() {
  const savedRun = useRef(loadSavedRunState())
  const [sourceStep, setSourceStep] = useState<SourceStep>(savedRun.current.sourceStep)
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(savedRun.current.pipelineRunId)
  const [pipelineResult, setPipelineResult] = useState<Prompt2BlogPipelinePayload | null>(
    savedRun.current.pipelineResult,
  )

  useEffect(() => {
    const persistedState: PersistedRunState = { sourceStep, pipelineRunId, pipelineResult }
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(persistedState))
  }, [sourceStep, pipelineRunId, pipelineResult])

  const clearPersistedRunState = () => {
    localStorage.removeItem(RUN_STORAGE_KEY)
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
