import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getPrompt2BlogEditorialOptions,
  getPrompt2BlogInputOptions,
  type Prompt2BlogEditorialOptionsResponse,
  type Prompt2BlogCommissionDraft,
  type Prompt2BlogDirectionOptionId,
  type Prompt2BlogDirectionResponse,
  type Prompt2BlogEvidencePackage,
  type Prompt2BlogInputOptionsResponse,
} from '../../api'
import {
  COMPOSER_STORAGE_KEY,
  DEFAULT_COMPOSER_STATE,
  loadSavedComposerState,
  saveComposerState,
} from '../composer.storage'
import type { P2BFormState } from '../composer.types'
import { findDefaultOption } from '../option-defaults'
import {
  buildPrompt2BlogV3Payload,
  prompt2BlogSubmissionBlockedReason,
} from '../v3-payload'
import { approveCommission as fingerprintApprovedCommission } from '../commission'
import {
  applyValidatedDirectionResponse,
  approveCommission as storeApprovedCommission,
  markCommissionReviewed,
  clearDirectionWorkflow as resetDirectionWorkflow,
  clearEvidencePackage,
  storeEvidencePackage,
  editCommissionDraft,
  selectDirectionOption as selectCommissionDirection,
  startEditorialWorkflow,
} from '../commission-state'

function createDefaultComposerState(): P2BFormState {
  return {
    ...DEFAULT_COMPOSER_STATE,
    editorial: {
      ...DEFAULT_COMPOSER_STATE.editorial,
      directionOptions: [],
      approval: { ...DEFAULT_COMPOSER_STATE.editorial.approval },
    },
  }
}

export function usePrompt2BlogComposer() {
  const saved = useRef(loadSavedComposerState())
  const [state, setState] = useState<P2BFormState>(saved.current)
  const [inputOptions, setInputOptions] = useState<Prompt2BlogInputOptionsResponse | null>(null)

  const updateField = useCallback(
    <K extends keyof P2BFormState>(field: K, value: P2BFormState[K]) => {
      setState(prev => {
        const changedSetupIdentity =
          (field === 'easySetupTitle' && value !== prev.easySetupTitle) ||
          (field === 'easySetupLocation' && value !== prev.easySetupLocation)
        if (changedSetupIdentity && prev.activeWorkflow === 'editorial_v3') {
          return {
            ...prev,
            [field]: value,
            editorial: {
              directionOptions: [],
              selectedOptionId: null,
              commissionDraft: null,
              approval: {
                status: 'reconfirmation_required',
                reason: 'title_or_location_changed',
              },
              // A retitled article is not the commission that was read.
              reviewedCommissionFingerprint: null,
              evidencePackage: null,
            },
          }
        }
        return { ...prev, [field]: value }
      })
    },
    [],
  )

  useEffect(() => {
    saveComposerState(state)
  }, [state])

  useEffect(() => {
    let cancelled = false
    getPrompt2BlogInputOptions()
      .then(options => {
        if (cancelled) return
        setInputOptions(options)
        setState(prev => ({
          ...prev,
          toneId: prev.toneId || options.defaults.tone_id || findDefaultOption(options.tones),
          lengthId:
            prev.lengthId || options.defaults.length_id || findDefaultOption(options.lengths),
          brandVoiceId:
            prev.brandVoiceId ||
            options.defaults.brand_voice_id ||
            findDefaultOption(options.brand_voices),
        }))
      })
      .catch(() => {
        if (cancelled) return
        setInputOptions({
          tones: [],
          lengths: [],
          brand_voices: [],
          defaults: {
            tone_id: '',
            length_id: '',
            brand_voice_id: '',
          },
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const editorialOptionsQuery = useQuery<Prompt2BlogEditorialOptionsResponse>({
    queryKey: ['prompt2blog', 'editorial-options'],
    queryFn: getPrompt2BlogEditorialOptions,
    staleTime: 5 * 60 * 1000,
  })
  const editorialOptions = editorialOptionsQuery.data ?? null

  const v3Payload = useMemo(() => buildPrompt2BlogV3Payload(state), [state])
  // An approved commission with attached research runs on v3. Everything else
  // in the editorial workflow reports what is still missing; a legacy draft
  // keeps the v2 path and its own validation.
  const submissionBlockedReason = useMemo(
    () => prompt2BlogSubmissionBlockedReason(state),
    [state],
  )

  const startDirectionWorkflow = useCallback(() => {
    setState(startEditorialWorkflow)
  }, [])

  const applyDirectionResponse = useCallback((response: Prompt2BlogDirectionResponse) => {
    setState(prev => applyValidatedDirectionResponse(prev, response))
  }, [])

  const selectDirectionOption = useCallback(
    async (optionId: Prompt2BlogDirectionOptionId) => {
      if (!editorialOptions) throw new Error('Editorial options are still loading.')
      const selectedState = selectCommissionDirection(state, optionId)
      const draft = selectedState.editorial.commissionDraft
      if (!draft) throw new Error('The selected direction did not create a commission.')
      setState(selectedState)
      const commission = await fingerprintApprovedCommission(draft, editorialOptions)
      setState(prev => {
        if (
          prev.easySetupTitle.trim() !== draft.original_title ||
          prev.easySetupLocation.trim() !== draft.location ||
          prev.editorial.selectedOptionId !== optionId
        )
          return prev
        return storeApprovedCommission(prev, commission)
      })
    },
    [editorialOptions, state],
  )

  const updateCommissionDraft = useCallback((draft: Prompt2BlogCommissionDraft) => {
    setState(prev => editCommissionDraft(prev, draft))
  }, [])

  const approveCommissionChanges = useCallback(async () => {
    if (!editorialOptions || !state.editorial.commissionDraft) {
      throw new Error('Complete the commission before approving it.')
    }
    const draft = state.editorial.commissionDraft
    const commission = await fingerprintApprovedCommission(draft, editorialOptions)
    setState(prev =>
      prev.editorial.commissionDraft !== draft
        ? prev
        : // Pressing approve is itself the deliberate read that the review step
          // asks for, so it does not ask again.
          storeApprovedCommission(prev, commission, { reviewed: true }),
    )
  }, [editorialOptions, state.editorial.commissionDraft])

  const confirmCommissionReview = useCallback(() => {
    setState(markCommissionReviewed)
  }, [])

  const storeEvidence = useCallback((evidencePackage: Prompt2BlogEvidencePackage) => {
    setState(prev => storeEvidencePackage(prev, evidencePackage))
  }, [])

  const clearEvidence = useCallback(() => {
    setState(clearEvidencePackage)
  }, [])

  const clearDirectionWorkflow = useCallback(() => {
    setState(resetDirectionWorkflow)
  }, [])

  const clearPromptProfiles = useCallback(() => {
    setState(prev => ({
      ...prev,
      toneId: inputOptions ? findDefaultOption(inputOptions.tones) : DEFAULT_COMPOSER_STATE.toneId,
      lengthId: inputOptions
        ? findDefaultOption(inputOptions.lengths)
        : DEFAULT_COMPOSER_STATE.lengthId,
      brandVoiceId: inputOptions
        ? findDefaultOption(inputOptions.brand_voices)
        : DEFAULT_COMPOSER_STATE.brandVoiceId,
      creativityLevel: DEFAULT_COMPOSER_STATE.creativityLevel,
    }))
  }, [inputOptions])

  const clearAll = useCallback(() => {
    localStorage.removeItem(COMPOSER_STORAGE_KEY)
    setState(createDefaultComposerState())
  }, [])

  return {
    state,
    updateField,
    inputOptions,
    editorialOptions,
    editorialOptionsError: editorialOptionsQuery.isError,
    editorialOptionsLoading: editorialOptionsQuery.isPending,
    retryEditorialOptions: () => {
      void editorialOptionsQuery.refetch()
    },
    v3Payload,
    submissionBlockedReason,
    startDirectionWorkflow,
    applyDirectionResponse,
    selectDirectionOption,
    updateCommissionDraft,
    approveCommissionChanges,
    confirmCommissionReview,
    storeEvidence,
    clearEvidence,
    clearDirectionWorkflow,
    clearPromptProfiles,
    clearAll,
  }
}
