import { useMutation } from '@tanstack/react-query'
import {
  startPrompt2BlogRun,
  startPrompt2BlogV3Run,
  type Prompt2BlogRunRequest,
  type Prompt2BlogV3NeedsResearchResponse,
  type Prompt2BlogV3Request,
} from '../../api'
import { validatePipelinePayload } from '../validate-pipeline-payload'

/**
 * How a start attempt ended. `needs_research` is not a failure: the commission
 * was valid, the deterministic gate ran, and it found evidence that cannot
 * support the article. Nothing was queued and no writer-model token was spent,
 * so it is a result the UI has to show rather than an error to throw.
 */
export type Prompt2BlogStartOutcome =
  | { kind: 'queued'; runId: string }
  | { kind: 'needs_research'; payload: Prompt2BlogV3NeedsResearchResponse }

type Prompt2BlogMutationPayloads = {
  v2Payload: Prompt2BlogRunRequest | null
  v3Payload: Prompt2BlogV3Request | null
  v3BlockedReason?: string | null
}

/**
 * An approved v3 commission takes the v3 route; everything else stays on v2.
 * The two payloads are mutually exclusive by construction — `buildPrompt2BlogV3Payload`
 * returns null unless the composer is in the editorial workflow, and
 * `buildPrompt2BlogPayload` returns null when it is.
 */
export function usePrompt2BlogMutation({
  v2Payload,
  v3Payload,
  v3BlockedReason,
}: Prompt2BlogMutationPayloads) {
  return useMutation<Prompt2BlogStartOutcome, Error, void>({
    mutationFn: async () => {
      if (v3Payload) {
        const response = await startPrompt2BlogV3Run(v3Payload)
        return response.status === 'queued'
          ? { kind: 'queued', runId: response.run_id }
          : { kind: 'needs_research', payload: response }
      }

      if (v3BlockedReason) throw new Error(v3BlockedReason)

      const validationError = validatePipelinePayload(v2Payload)
      if (validationError) throw new Error(validationError)
      if (!v2Payload) throw new Error('Article type is required.')
      const response = await startPrompt2BlogRun(v2Payload)
      return { kind: 'queued', runId: response.run_id }
    },
  })
}
