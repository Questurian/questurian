import { useMutation } from '@tanstack/react-query'
import {
  startPrompt2BlogV3Run,
  type Prompt2BlogV3NeedsResearchResponse,
  type Prompt2BlogV3Request,
} from '../../api'

/**
 * How a start attempt ended. `needs_research` is not a failure: the commission
 * was valid, the deterministic gate ran, and it found evidence that cannot
 * support the article. Nothing was queued and no writer-model token was spent,
 * so it is a result the UI has to show rather than an error to throw.
 */
export type Prompt2BlogStartOutcome =
  | { kind: 'queued'; runId: string }
  | { kind: 'needs_research'; payload: Prompt2BlogV3NeedsResearchResponse }

type Prompt2BlogMutationOptions = {
  v3Payload: Prompt2BlogV3Request | null
  v3BlockedReason?: string | null
}

export function usePrompt2BlogMutation({
  v3Payload,
  v3BlockedReason,
}: Prompt2BlogMutationOptions) {
  return useMutation<Prompt2BlogStartOutcome, Error, void>({
    mutationFn: async () => {
      if (!v3Payload) {
        throw new Error(
          v3BlockedReason || 'Approve a commission and import its research before running.',
        )
      }
      const response = await startPrompt2BlogV3Run(v3Payload)
      return response.status === 'queued'
        ? { kind: 'queued', runId: response.run_id }
        : { kind: 'needs_research', payload: response }
    },
  })
}
