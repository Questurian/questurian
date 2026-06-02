import { useMutation } from '@tanstack/react-query'
import {
  startPrompt2BlogRun,
  type Prompt2BlogRunRequest,
  type Prompt2BlogRunResponse,
} from '../../api'
import { validatePipelinePayload } from '../validate-pipeline-payload'

export function usePrompt2BlogMutation(payload: Prompt2BlogRunRequest) {
  return useMutation<Prompt2BlogRunResponse, Error, void>({
    mutationFn: async () => {
      const validationError = validatePipelinePayload(payload)
      if (validationError) throw new Error(validationError)
      return startPrompt2BlogRun(payload)
    },
  })
}
