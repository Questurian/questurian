import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'
import { EDITOR_ASSIST_MODEL_OPTIONS } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import {
  fetchCurrencyOptions,
  fetchLocationById,
  fetchLocationOptions,
  fetchMediaSetOptions,
  fillLocationDocumentWithAi,
  fillLocationFieldWithAi,
  fillLocationSectionWithAi,
  updateLocation
} from '../api'
import { FieldRenderer } from '../components/FieldRenderer'
import {
  buildLocationHierarchyTitle,
  buildDraftFromPayloadDoc,
  buildPayloadLocationBody,
  collectUnresolvedHintWarnings,
  getVisibleLocationSections,
  markDraftAsPayloadSynced,
  preserveDraftRelationshipHints,
  refreshDraftPayloadSyncState,
  resolveDraftHints,
  resolveLocationDraftRef,
  validateDraft
} from '../schema'
import { findDraftByDraftId, findDraftByPayloadId, removeDraft, saveDraft } from '../storage'
import { useBuilderAutosave } from '../../shared/builder/hooks/useBuilderAutosave'
import type {
  ArrayFieldDefinition,
  LocationDocumentDraft,
  LocationSectionDefinition,
  ScalarFieldDefinition
} from '../types'
import {
  diffChangedPaths,
  formatPath,
  getValueAtPath,
  setValueAtPath
} from '../utils'
import '../styles.css'

type AiTarget =
  | {
      type: 'document'
      label: string
    }
  | {
      type: 'section'
      label: string
      section: LocationSectionDefinition
    }
  | {
      type: 'field'
      label: string
      path: string[]
      field: ScalarFieldDefinition
    }
  | {
      type: 'array'
      label: string
      path: string[]
      section: LocationSectionDefinition
      sectionPath: string[]
      field: ArrayFieldDefinition
    }

type AiRunMode = 'generate' | 'improve'
type AiRunState = {
  target: AiTarget
  mode: AiRunMode
}

function buildAiInstruction(
  target: AiTarget,
  mode: AiRunMode,
  customInstruction: string
): string {
  const custom = customInstruction.trim()

  const generatePrompts = {
    document:
      'Generate the strongest complete version of this location document using the draft context and source notes. Fill missing fields, keep correct existing facts, and write concise practical copy.',
    section: `Generate a strong complete draft for the ${target.label} section. Use the current location context and source notes, preserve accurate existing facts, and fill missing content with practical, UI-ready copy.`,
    field: `Generate the best concise value for the ${target.label} field using the current location context, current draft, and source notes. Return a clean final value only.`,
    array: `Generate strong, practical entries for the ${target.label} list using the current location context and source notes. Return the full section JSON, but only update this list while preserving all other section fields.`
  } as const

  const improvePrompts = {
    document:
      'Improve the current location document using the existing content as context. Keep what is strong, fix weak or vague copy, and make the result more specific, useful, and consistent.',
    section: `Improve the current ${target.label} section using the existing section content as context. Keep strong facts, rewrite weak content, and make the section more specific, practical, and polished.`,
    field: `Improve the current ${target.label} field using its existing content as context. Keep the useful intent, but rewrite it into a clearer, stronger final value.`,
    array: `Improve the current ${target.label} list using the existing values as context. Return the full section JSON, but only update this list while preserving all other section fields.`
  } as const

  const basePrompt =
    mode === 'generate'
      ? generatePrompts[target.type]
      : improvePrompts[target.type]

  const isModeSection =
    target.type === 'section'
    && ['explore', 'stay', 'move'].includes(target.section.id)
  const highlightRequirement =
    target.type === 'document'
      ? '\n\nRequirement: for city/neighborhood drafts, include 3-4 highlights in each mode: guide.explore.highlights, guide.stay.highlights, and guide.move.highlights.'
      : isModeSection
        ? '\n\nRequirement: return 3-4 highlights for this mode section.'
        : ''
  const promptWithRules = `${basePrompt}${highlightRequirement}`

  if (!custom) return promptWithRules

  return `${promptWithRules}\n\nAdditional direction:\n${custom}`
}

export default function LocationDocumentBuilderPage() {
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState<LocationDocumentDraft | null>(null)
  const [locations, setLocations] = useState<
    Awaited<ReturnType<typeof fetchLocationOptions>>
  >([])
  const [mediaSets, setMediaSets] = useState<
    Awaited<ReturnType<typeof fetchMediaSetOptions>>
  >([])
  const [currencies, setCurrencies] = useState<
    Awaited<ReturnType<typeof fetchCurrencyOptions>>
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [activeSectionId, setActiveSectionId] =
    useState<LocationSectionDefinition['id']>('hierarchy')
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null)
  const [aiInstruction, setAiInstruction] = useState('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [activeAiRun, setActiveAiRun] = useState<AiRunState | null>(null)
  const [lastAiChanges, setLastAiChanges] = useState<string[]>([])

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')
  const payloadId = payloadIdParam ? Number(payloadIdParam) : NaN

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setInitializationError(null)

    const loadDraft = async () => {
      try {
        if (draftIdParam) {
          const localDraft = findDraftByDraftId(draftIdParam)
          if (cancelled) return
          if (localDraft?.payloadId) {
            setDraft(localDraft)
            return
          }

          setDraft(null)
          setInitializationError('Open an existing Payload location from the list. This editor does not create new location records.')
          return
        }

        if (Number.isFinite(payloadId)) {
          const localDraft = findDraftByPayloadId(payloadId)
          if (localDraft) {
            if (cancelled) return
            if (draftIdParam !== localDraft.draftId) {
              setSearchParams({ draftId: localDraft.draftId }, { replace: true })
            }
            setDraft(localDraft)
            return
          }

          const payloadDoc = await fetchLocationById(payloadId, token)
          if (cancelled) return
          setDraft(buildDraftFromPayloadDoc(payloadDoc))
          return
        }

        if (cancelled) return
        setDraft(null)
        setInitializationError('Open an existing Payload location from the list. This editor does not create new location records.')
      } catch (err: unknown) {
        if (cancelled) return
        const errorMessage = err instanceof Error ? err.message : 'Failed to load builder data'
        setError(errorMessage)
        setInitializationError(errorMessage)
        console.error('LocationDocumentBuilder initialization failed', {
          error: err,
          payloadIdParam,
          draftIdParam,
          payloadId,
          tokenPresent: Boolean(token),
        })
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDraft()

    return () => {
      cancelled = true
    }
  }, [draftIdParam, payloadId, payloadIdParam, setSearchParams, token])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setOptionsError(null)

    Promise.allSettled([
      fetchLocationOptions(token),
      fetchMediaSetOptions(token),
      fetchCurrencyOptions(token),
    ]).then(([locationResult, mediaResult, currencyResult]) => {
      if (cancelled) return

      if (locationResult.status === 'fulfilled') {
        setLocations(locationResult.value)
      } else {
        setLocations([])
      }

      if (mediaResult.status === 'fulfilled') {
        setMediaSets(mediaResult.value)
      } else {
        setMediaSets([])
      }

      if (currencyResult.status === 'fulfilled') {
        setCurrencies(currencyResult.value)
      } else {
        setCurrencies([])
      }

      const messages: string[] = []
      if (locationResult.status === 'rejected') {
        messages.push(
          locationResult.reason instanceof Error
            ? locationResult.reason.message
            : 'Failed to load location options'
        )
      }
      if (mediaResult.status === 'rejected') {
        messages.push(
          mediaResult.reason instanceof Error
            ? mediaResult.reason.message
            : 'Failed to load media set options'
        )
      }

      if (currencyResult.status === 'rejected') {
        messages.push(
          currencyResult.reason instanceof Error
            ? currencyResult.reason.message
            : 'Failed to load currency options'
        )
      }

      if (messages.length > 0) {
        setOptionsError(messages.join(' '))
      }
    })

    return () => {
      cancelled = true
    }
  }, [token])

  useBuilderAutosave(draft, saveDraft, 1200)

  useEffect(() => {
    if (!draft) return
    const visibleSections = getVisibleLocationSections(draft.level)
    if (!visibleSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId('hierarchy')
    }
  }, [activeSectionId, draft])

  useEffect(() => {
    if (!draft) return

    let resolved = resolveDraftHints(draft, locations, currencies)
    resolved = refreshDraftPayloadSyncState(resolved, locations, currencies)
    if (JSON.stringify(resolved) !== JSON.stringify(draft)) {
      setDraft(resolved)
    }
  }, [draft, locations, currencies])

  const visibleSections = useMemo(() => {
    if (!draft) return []
    return getVisibleLocationSections(draft.level)
  }, [draft])

  const activeSection =
    visibleSections.find((section) => section.id === activeSectionId) ||
    visibleSections[0]
  const syncValidationError = draft ? validateDraft(draft) : null
  const requiresPayloadResync = Boolean(draft?.payloadId && draft.hasUnsyncedPayloadChanges)
  const payloadSyncTimestamp = draft?.lastPayloadSyncAt
  const currentLocationRef = useMemo(() => {
    if (!draft) return null
    return resolveLocationDraftRef(draft, locations)
  }, [draft, locations])
  const modeLabel = draft?.payloadId
    ? 'Editing Payload'
    : 'Unavailable'
  const headerTitle = useMemo(() => {
    if (!draft) return 'Location Editor'
    return buildLocationHierarchyTitle(draft) || 'Location Editor'
  }, [draft])
  const activeAiPathKey = useMemo(() => {
    if (!activeAiRun) return null
    if (activeAiRun.target.type === 'field' || activeAiRun.target.type === 'array') {
      return activeAiRun.target.path.join('.')
    }
    return null
  }, [activeAiRun])
  const isGeneratingFullDraft = Boolean(
    isGeneratingAi
    && activeAiRun?.target.type === 'document'
    && activeAiRun.mode === 'generate'
  )
  const isGeneratingActiveSection = Boolean(
    activeSection
    && isGeneratingAi
    && activeAiRun?.target.type === 'section'
    && activeAiRun.target.section.id === activeSection.id
    && activeAiRun.mode === 'generate'
  )

  const updateDraftValue = useCallback((path: string[], value: unknown) => {
    setDraft((current) => {
      if (!current) return current
      let nextDraft = setValueAtPath(current, path, value)

      if (path.join('.') === 'guide.core.moneyHandling.currency') {
        const selectedCurrency = currencies.find((option) => option.id === value)
        nextDraft = setValueAtPath(
          nextDraft,
          ['guide', 'core', 'moneyHandling', 'currencyCode'],
          selectedCurrency?.code ?? '',
        )
      }

      return nextDraft
    })
  }, [currencies])

  const handleSaveDraft = useCallback(() => {
    if (!draft) return
    saveDraft(draft)
    setResult('Saved local changes in this browser.')
    setError(null)
  }, [draft])

  const handleSubmit = useCallback(async () => {
    if (!token || !draft) return

    setIsSaving(true)
    setError(null)
    setResult(null)

    try {
      if (!draft.payloadId) {
        throw new Error('This editor only updates existing Payload location records.')
      }

      const validationError = validateDraft(draft)
      if (validationError) {
        throw new Error(validationError)
      }

      let saveLocations = locations
      let saveCurrencies = currencies
      let unresolvedWarnings = collectUnresolvedHintWarnings(draft, saveLocations, saveCurrencies)

      if (unresolvedWarnings.length > 0) {
        try {
          const [refreshedLocations, refreshedCurrencies] = await Promise.all([
            fetchLocationOptions(token),
            fetchCurrencyOptions(token),
          ])
          saveLocations = refreshedLocations
          saveCurrencies = refreshedCurrencies
          setLocations(refreshedLocations)
          setCurrencies(refreshedCurrencies)
          unresolvedWarnings = collectUnresolvedHintWarnings(draft, refreshedLocations, refreshedCurrencies)
        } catch (refreshError: unknown) {
          console.warn('Failed to refresh builder reference options before save', refreshError)
        }
      }

      const payloadBody = buildPayloadLocationBody(draft, saveLocations, saveCurrencies)
      const savedDoc = await updateLocation(draft.payloadId, payloadBody, token)

      const syncedDraft = markDraftAsPayloadSynced(
        {
          ...buildDraftFromPayloadDoc(savedDoc),
          draftId: draft.draftId,
          editorModelName: draft.editorModelName,
          aiSourceNotes: draft.aiSourceNotes
        },
        savedDoc.updatedAt || new Date().toISOString(),
        saveLocations,
        saveCurrencies,
      )
      const nextDraft = preserveDraftRelationshipHints(syncedDraft, draft)

      setDraft(nextDraft)
      saveDraft(nextDraft)
      setSearchParams({
        id: String(savedDoc.id),
        draftId: nextDraft.draftId
      })
      setResult(
        `Updated Payload location document.${
          unresolvedWarnings.length > 0
            ? ' Some reference hints could not be matched yet, so they were kept in your local edits only.'
            : ''
        }`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save location')
    } finally {
      setIsSaving(false)
    }
  }, [currencies, draft, locations, setSearchParams, token])

  const runAiTarget = useCallback(
    async (target: AiTarget, mode: AiRunMode, customInstruction = '') => {
      if (!draft || isGeneratingAi) return

      setActiveAiRun({ target, mode })
      setIsGeneratingAi(true)
      setError(null)
      setResult(null)

      try {
        const instruction = buildAiInstruction(target, mode, customInstruction)

        if (target.type === 'document') {
          const response = await fillLocationDocumentWithAi({
            draft,
            instruction,
            sourceNotes: draft.aiSourceNotes,
            modelName: draft.editorModelName
          })

          const nextDraft = resolveDraftHints(
            {
              ...response.document,
              draftId: draft.draftId,
              payloadId: draft.payloadId,
              editorModelName: draft.editorModelName,
              aiSourceNotes: draft.aiSourceNotes,
              updatedAt: draft.updatedAt
            },
            locations
          )

          setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
          setDraft(nextDraft)
          setResult(
            mode === 'generate'
              ? `Full document generated with ${response.modelUsed}.`
              : `Full document improved with ${response.modelUsed}.`
          )
        }

        if (target.type === 'section') {
          const currentValue = getValueAtPath(draft, target.section.path)
          const response = await fillLocationSectionWithAi({
            draft,
            sectionPath: target.section.aiPath || target.section.path.join('.'),
            sectionValue:
              currentValue && typeof currentValue === 'object'
                ? (currentValue as Record<string, unknown>)
                : null,
            instruction,
            sourceNotes: draft.aiSourceNotes,
            modelName: draft.editorModelName
          })

          const nextDraft = resolveDraftHints(
            setValueAtPath(draft, target.section.path, response.section),
            locations
          )

          setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
          setDraft(nextDraft)
          setResult(
            mode === 'generate'
              ? `Section generated with ${response.modelUsed}.`
              : `Section improved with ${response.modelUsed}.`
          )
        }

        if (target.type === 'array') {
          const currentSectionValue = getValueAtPath(draft, target.section.path)
          const response = await fillLocationSectionWithAi({
            draft,
            sectionPath: target.section.aiPath || target.section.path.join('.'),
            sectionValue:
              currentSectionValue && typeof currentSectionValue === 'object'
                ? (currentSectionValue as Record<string, unknown>)
                : null,
            instruction,
            sourceNotes: draft.aiSourceNotes,
            modelName: draft.editorModelName
          })

          const generatedArray = getValueAtPath(
            response.section as Record<string, unknown>,
            target.sectionPath
          )

          if (!Array.isArray(generatedArray)) {
            throw new Error(`AI response did not return a valid array for ${target.label}.`)
          }

          const nextDraft = setValueAtPath(draft, target.path, generatedArray)
          setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
          setDraft(nextDraft)
          setResult(
            mode === 'generate'
              ? `${target.label} generated with ${response.modelUsed}.`
              : `${target.label} improved with ${response.modelUsed}.`
          )
        }

        if (target.type === 'field') {
          const currentValue = getValueAtPath(draft, target.path)
          const response = await fillLocationFieldWithAi({
            draft,
            fieldPath: formatPath(target.path),
            currentValue: typeof currentValue === 'string' ? currentValue : '',
            instruction,
            sourceNotes: draft.aiSourceNotes,
            modelName: draft.editorModelName
          })

          const nextDraft = setValueAtPath(draft, target.path, response.value)
          setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
          setDraft(nextDraft)
          setResult(
            mode === 'generate'
              ? `Field generated with ${response.modelUsed}.`
              : `Field improved with ${response.modelUsed}.`
          )
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'AI generation failed')
      } finally {
        setActiveAiRun(null)
        setIsGeneratingAi(false)
      }
    },
    [draft, isGeneratingAi, locations]
  )

  const openImproveAi = useCallback((target: AiTarget) => {
    setAiInstruction('')
    setAiTarget(target)
  }, [])

  const handleFieldAiGenerate = useCallback(
    (path: string[], field: ScalarFieldDefinition) => {
      void runAiTarget(
        {
          type: 'field',
          label: field.label,
          path,
          field
        },
        'generate'
      )
    },
    [runAiTarget]
  )

  const handleFieldAiImprove = useCallback(
    (path: string[], field: ScalarFieldDefinition) => {
      openImproveAi({
        type: 'field',
        label: field.label,
        path,
        field
      })
    },
    [openImproveAi]
  )

  const buildArrayAiTarget = useCallback(
    (path: string[], field: ArrayFieldDefinition): Extract<AiTarget, { type: 'array' }> | null => {
      if (!activeSection?.aiPath) return null
      const startsWithSectionPath = activeSection.path.every(
        (segment, index) => path[index] === segment
      )
      if (!startsWithSectionPath) return null

      return {
        type: 'array',
        label: field.label,
        path,
        section: activeSection,
        sectionPath: path.slice(activeSection.path.length),
        field
      }
    },
    [activeSection]
  )

  const handleArrayAiGenerate = useCallback(
    (path: string[], field: ArrayFieldDefinition) => {
      const target = buildArrayAiTarget(path, field)
      if (!target) {
        setError('AI generation is unavailable for this list.')
        return
      }

      void runAiTarget(target, 'generate')
    },
    [buildArrayAiTarget, runAiTarget]
  )

  const handleArrayAiImprove = useCallback(
    (path: string[], field: ArrayFieldDefinition) => {
      const target = buildArrayAiTarget(path, field)
      if (!target) {
        setError('AI improvement is unavailable for this list.')
        return
      }

      openImproveAi(target)
    },
    [buildArrayAiTarget, openImproveAi]
  )

  const handleRunAiImprovement = useCallback(async () => {
    if (!aiTarget) return

    await runAiTarget(aiTarget, 'improve', aiInstruction)
    setAiTarget(null)
    setAiInstruction('')
  }, [aiInstruction, aiTarget, runAiTarget])

  const handleDiscardUnsupportedLocalRecord = useCallback(() => {
    if (draftIdParam) {
      removeDraft(draftIdParam)
    }
    setInitializationError(null)
    setError(null)
    setSearchParams({})
  }, [draftIdParam, setSearchParams])

  if (isLoading) {
    return (
      <div className="ldb-page">
        <div className="ldb-panel">
          <p className="ldb-placeholder">Loading location builder...</p>
        </div>
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="ldb-page">
        <div className="ldb-panel">
          <p className="ldb-error">
            Unable to initialize the location builder.
          </p>
          {initializationError ? (
            <p className="ldb-error">Initialization error: {initializationError}</p>
          ) : null}
          {draftIdParam ? (
            <button
              type="button"
              className="ldb-btn ldb-btn-secondary"
              onClick={handleDiscardUnsupportedLocalRecord}
            >
              Discard Unsupported Local Record
            </button>
          ) : null}
          <Link className="ldb-link" to="/location-documents">
            Back to location documents
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="ldb-page ldb-builder-page">
      <header className="ldb-builder-hero">
        <Link className="ldb-builder-back-link" to="/location-documents">
          Back to documents
        </Link>

        <div className="ldb-builder-hero-copy">
          <p className="ldb-eyebrow">Questurian Studio</p>
          <div className="ldb-title-row">
            <h1>{headerTitle}</h1>
            <span className="ldb-mode-badge">{modeLabel}</span>
          </div>
          <p className="ldb-lede">
            Review and update the existing Payload `locations` document with
            hierarchy, media, and city/neighborhood guide content.
          </p>
        </div>

        <div className="ldb-builder-actions">
          <div className="ldb-builder-actions-card">
            <div className="ldb-builder-actions-head">
              <p className="ldb-builder-actions-kicker">Studio Controls</p>
              <p className="ldb-builder-actions-copy">
                Pick a model, generate updates, then save your local changes or
                sync the finished edit back to Payload.
              </p>
            </div>

            <label className="ldb-field ldb-model-field ldb-builder-model-field">
              <span className="ldb-label">AI Model</span>
              <select
                className="ldb-select"
                value={draft.editorModelName}
                onChange={(event) =>
                  updateDraftValue(['editorModelName'], event.target.value)
                }
              >
                {EDITOR_ASSIST_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="ldb-builder-action-groups">
              <div className="ldb-builder-action-group">
                <span className="ldb-builder-action-group-label">
                  Primary actions
                </span>
                <div className="ldb-builder-action-grid ldb-builder-action-grid--primary">
                  <button
                    type="button"
                    className="ldb-btn ldb-btn-accent"
                    disabled={isGeneratingAi}
                    onClick={() => {
                      void runAiTarget(
                        { type: 'document', label: 'Full document' },
                        'generate'
                      )
                    }}
                  >
                    {isGeneratingFullDraft ? (
                      <>
                        <span className="ldb-spinner ldb-spinner--sm" />
                        Generating...
                      </>
                    ) : 'Generate Full Update'}
                  </button>
                  <button
                    type="button"
                    className="payload-action-btn"
                    onClick={handleSubmit}
                    disabled={isSaving || Boolean(syncValidationError)}
                    title={syncValidationError || undefined}
                  >
                    <img src={payloadLogoUrl} alt="" aria-hidden="true" className="payload-action-btn-icon" />
                    {isSaving ? 'Syncing...' : requiresPayloadResync ? 'Resync to Payload' : 'Sync to Payload'}
                  </button>
                </div>
              </div>

              <div className="ldb-builder-action-group">
                <span className="ldb-builder-action-group-label">
                  Local changes
                </span>
                <div className="ldb-builder-action-grid">
                  <button
                    type="button"
                    className="ldb-btn ldb-btn-secondary"
                    onClick={handleSaveDraft}
                    disabled={isGeneratingAi}
                  >
                    Save Local Changes
                  </button>
                  <button
                    type="button"
                    className="ldb-btn ldb-btn-secondary"
                    disabled={isGeneratingAi}
                    onClick={() =>
                      openImproveAi({
                        type: 'document',
                        label: 'Full document'
                      })
                    }
                  >
                    Improve Content
                  </button>
                </div>
              </div>
            </div>

            {syncValidationError ? (
              <p className="ldb-builder-actions-warning">
                Payload sync blocked: {syncValidationError}
              </p>
            ) : null}

            {!syncValidationError && requiresPayloadResync ? (
              <p className="ldb-builder-actions-warning">
                Local changes are newer than the last Payload sync. Sync again to update the live document.
              </p>
            ) : null}

            <p className="ldb-builder-actions-note">
              {draft.payloadId && payloadSyncTimestamp && !requiresPayloadResync
                ? `Payload is up to date as of ${new Date(payloadSyncTimestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}. Local changes auto-save in this browser while you work.`
                : 'Local changes auto-save in this browser while you work.'}
            </p>
          </div>
        </div>
      </header>

      {error ? <p className="ldb-error">{error}</p> : null}
      {optionsError ? <p className="ldb-error">{optionsError}</p> : null}
      {isGeneratingAi ? (
        <p className="ldb-placeholder ldb-ai-progress">
          <span className="ldb-spinner ldb-spinner--sm" />
          Running AI...
        </p>
      ) : null}
      {result ? <p className="ldb-success">{result}</p> : null}

      <nav className="ldb-panel ldb-tabs-panel" aria-label="Document sections">
        <div className="ldb-tab-list ldb-top-tab-list" role="tablist">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={section.id === activeSection?.id}
              className={`ldb-tab${section.id === activeSection?.id ? ' is-active' : ''}`}
              onClick={() => setActiveSectionId(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>{activeSection?.label}</h2>
            <p>{activeSection?.description}</p>
          </div>
          {activeSection?.aiPath ? (
            <div className="ldb-ai-action-row">
              <button
                type="button"
                className="ldb-btn ldb-btn-secondary"
                disabled={isGeneratingAi}
                onClick={() => {
                  void runAiTarget(
                    {
                      type: 'section',
                      label: activeSection.label,
                      section: activeSection
                    },
                    'generate'
                  )
                }}
              >
                {isGeneratingActiveSection ? (
                  <>
                    <span className="ldb-spinner ldb-spinner--sm" />
                    Generating...
                  </>
                ) : 'Generate Section'}
              </button>
              <button
                type="button"
                className="ldb-btn ldb-btn-secondary"
                disabled={isGeneratingAi}
                onClick={() =>
                  openImproveAi({
                    type: 'section',
                    label: activeSection.label,
                    section: activeSection
                  })
                }
              >
                Improve Section
              </button>
            </div>
          ) : null}
        </div>

        {activeSection ? (
          <FieldRenderer
            fields={activeSection.fields}
            basePath={activeSection.path}
            draft={draft}
            token={token}
            locationRef={currentLocationRef}
            locations={locations}
            currencies={currencies}
            mediaSets={mediaSets}
            onChange={updateDraftValue}
            onFieldAiGenerate={handleFieldAiGenerate}
            onFieldAiImprove={handleFieldAiImprove}
            onArrayAiGenerate={handleArrayAiGenerate}
            onArrayAiImprove={handleArrayAiImprove}
            isAiRunning={isGeneratingAi}
            activeAiPathKey={activeAiPathKey}
          />
        ) : null}
      </section>

      {lastAiChanges.length > 0 ? (
        <section className="ldb-panel">
          <div className="ldb-panel-header">
            <div>
              <h2>Latest AI Changes</h2>
              <p>Recent paths modified by the most recent AI action.</p>
            </div>
          </div>
          <div className="ldb-pill-list">
            {lastAiChanges.map((path) => (
              <span key={path} className="ldb-pill ldb-pill-muted">
                {path}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {aiTarget ? (
        <div className="ldb-ai-modal-backdrop">
          <div className="ldb-ai-modal">
            <div className="ldb-ai-modal-header">
              <div>
                <p className="ldb-eyebrow">AI Assist</p>
                <h2>{aiTarget.label}</h2>
              </div>
              <button
                type="button"
                className="ldb-modal-close"
                disabled={isGeneratingAi}
                onClick={() => setAiTarget(null)}
              >
                ×
              </button>
            </div>

            <p className="ldb-ai-modal-copy">
              The current content is already being used as context. Add extra
              instructions only if you want the AI to improve it in a specific
              direction.
            </p>

            <textarea
              className="ldb-textarea"
              rows={7}
              value={aiInstruction}
              onChange={(event) => setAiInstruction(event.target.value)}
              placeholder="Optional improvement direction, tone preference, or detail request"
            />

            <div className="ldb-ai-modal-footer">
              <button
                type="button"
                className="ldb-btn ldb-btn-secondary"
                onClick={() => setAiTarget(null)}
                disabled={isGeneratingAi}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ldb-btn ldb-btn-accent"
                onClick={handleRunAiImprovement}
                disabled={isGeneratingAi}
              >
                {isGeneratingAi ? (
                  <>
                    <span className="ldb-spinner ldb-spinner--sm" />
                    Improving...
                  </>
                ) : 'Improve with AI'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
