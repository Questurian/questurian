import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getPrompt2BlogEditorialOptions,
  getPrompt2BlogGuidelinePreview,
  getPrompt2BlogInputOptions,
  type Prompt2BlogEditorialOptionsResponse,
  type Prompt2BlogCommissionDraft,
  type Prompt2BlogDirectionOptionId,
  type Prompt2BlogDirectionResponse,
  type Prompt2BlogGuidelinePreviewResponse,
  type Prompt2BlogInputOptionsResponse,
} from '../../api'
import {
  resolvePrompt2BlogModelStack,
  type Prompt2BlogModelStackId,
} from '../../constants/prompt2blog.constants'
import {
  buildGroupedArticleTypes,
  findDefaultOption,
  getArticleTypeQuickPicks,
} from '../article-type-options'
import {
  COMPOSER_STORAGE_KEY,
  DEFAULT_COMPOSER_STATE,
  loadSavedComposerState,
  saveComposerState,
} from '../composer.storage'
import type { P2BFormState } from '../composer.types'
import { buildPrompt2BlogPayload } from '../prompt-payload'
import { approveCommission as fingerprintApprovedCommission } from '../commission'
import {
  applyValidatedDirectionResponse,
  approveCommission as storeApprovedCommission,
  clearDirectionWorkflow as resetDirectionWorkflow,
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
    blobs: DEFAULT_COMPOSER_STATE.blobs.map(blob => ({ ...blob })),
  }
}

export function usePrompt2BlogComposer() {
  const saved = useRef(loadSavedComposerState())
  const [state, setState] = useState<P2BFormState>(saved.current)
  const [inputOptions, setInputOptions] = useState<Prompt2BlogInputOptionsResponse | null>(null)
  const [editorialOptions, setEditorialOptions] =
    useState<Prompt2BlogEditorialOptionsResponse | null>(null)
  const [guidelinePreview, setGuidelinePreview] =
    useState<Prompt2BlogGuidelinePreviewResponse | null>(null)
  const [guidelineLoading, setGuidelineLoading] = useState(false)

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
            },
          }
        }
        return { ...prev, [field]: value }
      })
    },
    [],
  )

  // The Easy Set Up import lands as one patch so the whole form moves to the
  // approved brief in a single state change.
  const applyFields = useCallback((patch: Partial<P2BFormState>) => {
    setState(prev => ({
      ...prev,
      ...patch,
      activeWorkflow: 'legacy_v2',
      editorial: { ...DEFAULT_COMPOSER_STATE.editorial },
    }))
  }, [])

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
          article_types: [],
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

  useEffect(() => {
    let cancelled = false
    getPrompt2BlogEditorialOptions()
      .then(options => {
        if (!cancelled) setEditorialOptions(options)
      })
      .catch(() => {
        if (!cancelled) setEditorialOptions(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!state.articleTypeId) {
      setGuidelinePreview(null)
      return
    }

    let cancelled = false
    setGuidelineLoading(true)
    getPrompt2BlogGuidelinePreview(state.articleTypeId)
      .then(payload => {
        if (!cancelled) setGuidelinePreview(payload)
      })
      .catch(() => {
        if (!cancelled) setGuidelinePreview(null)
      })
      .finally(() => {
        if (!cancelled) setGuidelineLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [state.articleTypeId])

  const articleTypeOptions = useMemo(() => inputOptions?.article_types ?? [], [inputOptions])
  const groupedArticleTypeOptions = useMemo(
    () => buildGroupedArticleTypes(articleTypeOptions),
    [articleTypeOptions],
  )
  const articleTypeQuickPicks = useMemo(
    () => getArticleTypeQuickPicks(articleTypeOptions),
    [articleTypeOptions],
  )
  const selectedArticleType = useMemo(
    () => articleTypeOptions.find(option => option.id === state.articleTypeId) || null,
    [articleTypeOptions, state.articleTypeId],
  )
  const payload = useMemo(() => buildPrompt2BlogPayload(state), [state])
  const submissionBlockedReason =
    state.activeWorkflow === 'editorial_v3'
      ? 'Editorial v3 direction work is active. Research import ships next; clear direction work to use legacy v2.'
      : null

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
      prev.editorial.commissionDraft !== draft ? prev : storeApprovedCommission(prev, commission),
    )
  }, [editorialOptions, state.editorial.commissionDraft])

  const clearDirectionWorkflow = useCallback(() => {
    setState(resetDirectionWorkflow)
  }, [])

  const addBlob = useCallback(() => {
    setState(prev => ({
      ...prev,
      blobs: [...prev.blobs, { id: Date.now(), content: '' }],
    }))
  }, [])

  const removeBlob = useCallback((id: number) => {
    setState(prev =>
      prev.blobs.length <= 1 ? prev : { ...prev, blobs: prev.blobs.filter(blob => blob.id !== id) },
    )
  }, [])

  const updateBlob = useCallback((id: number, content: string) => {
    setState(prev => ({
      ...prev,
      blobs: prev.blobs.map(blob => (blob.id === id ? { ...blob, content } : blob)),
    }))
  }, [])

  const clearCoreInputs = useCallback(() => {
    setState(prev => ({
      ...prev,
      articleTypeId: DEFAULT_COMPOSER_STATE.articleTypeId,
      articleGoal: DEFAULT_COMPOSER_STATE.articleGoal,
      targetReader: DEFAULT_COMPOSER_STATE.targetReader,
      destinationContext: DEFAULT_COMPOSER_STATE.destinationContext,
      angle: DEFAULT_COMPOSER_STATE.angle,
      callToAction: DEFAULT_COMPOSER_STATE.callToAction,
    }))
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
      negativeInstructions: DEFAULT_COMPOSER_STATE.negativeInstructions,
      enableEditorialAugmentation: DEFAULT_COMPOSER_STATE.enableEditorialAugmentation,
    }))
  }, [inputOptions])

  const clearModelRouting = useCallback(() => {
    setState(prev => ({
      ...prev,
      modelStackId: DEFAULT_COMPOSER_STATE.modelStackId,
      modelName: DEFAULT_COMPOSER_STATE.modelName,
      writingModel: DEFAULT_COMPOSER_STATE.writingModel,
      auditModel: DEFAULT_COMPOSER_STATE.auditModel,
    }))
  }, [])

  const applyModelStack = useCallback((modelStackId: Prompt2BlogModelStackId) => {
    const stack = resolvePrompt2BlogModelStack(modelStackId)
    setState(prev => ({
      ...prev,
      modelStackId: stack.id,
      modelName: stack.modelName,
      writingModel: stack.writingModel,
      auditModel: stack.auditModel,
    }))
  }, [])

  const clearSeoConstraints = useCallback(() => {
    setState(prev => ({
      ...prev,
      primaryKeyword: DEFAULT_COMPOSER_STATE.primaryKeyword,
      secondaryKeywords: DEFAULT_COMPOSER_STATE.secondaryKeywords,
      mustInclude: DEFAULT_COMPOSER_STATE.mustInclude,
    }))
  }, [])

  const clearSourceMaterial = useCallback(() => {
    setState(prev => ({ ...prev, blobs: createDefaultComposerState().blobs }))
  }, [])

  const clearAll = useCallback(() => {
    localStorage.removeItem(COMPOSER_STORAGE_KEY)
    setState(createDefaultComposerState())
  }, [])

  return {
    state,
    updateField,
    applyFields,
    inputOptions,
    editorialOptions,
    guidelinePreview,
    guidelineLoading,
    groupedArticleTypeOptions,
    articleTypeQuickPicks,
    selectedArticleType,
    payload,
    submissionBlockedReason,
    startDirectionWorkflow,
    applyDirectionResponse,
    selectDirectionOption,
    updateCommissionDraft,
    approveCommissionChanges,
    clearDirectionWorkflow,
    addBlob,
    removeBlob,
    updateBlob,
    clearCoreInputs,
    clearModelRouting,
    applyModelStack,
    clearPromptProfiles,
    clearSeoConstraints,
    clearSourceMaterial,
    clearAll,
  }
}
