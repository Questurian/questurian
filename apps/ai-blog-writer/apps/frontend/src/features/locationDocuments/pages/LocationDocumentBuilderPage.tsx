import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EDITOR_ASSIST_MODEL_OPTIONS } from '../../staging/api'
import { useAuth } from '../../../providers/useAuth'
import {
  createLocation,
  fetchLocationById,
  fetchLocationOptions,
  fetchMediaSetOptions,
  fillLocationDocumentWithAi,
  fillLocationFieldWithAi,
  fillLocationSectionWithAi,
  updateLocation,
} from '../api'
import { FieldRenderer } from '../components/FieldRenderer'
import {
  buildDraftFromPayloadDoc,
  buildPayloadLocationBody,
  collectUnresolvedHintWarnings,
  createEmptyLocationDocumentDraft,
  getVisibleLocationSections,
  resolveDraftHints,
  validateDraft,
} from '../schema'
import { findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../storage'
import type { LocationDocumentDraft, LocationSectionDefinition, ScalarFieldDefinition } from '../types'
import {
  diffChangedPaths,
  formatPath,
  getValueAtPath,
  setValueAtPath,
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

type AiRunMode = 'generate' | 'improve'

function buildAiInstruction(target: AiTarget, mode: AiRunMode, customInstruction: string): string {
  const custom = customInstruction.trim()

  const generatePrompts = {
    document:
      'Generate the strongest complete version of this location document using the draft context and source notes. Fill missing fields, keep correct existing facts, and write concise practical copy.',
    section: `Generate a strong complete draft for the ${target.label} section. Use the current location context and source notes, preserve accurate existing facts, and fill missing content with practical, UI-ready copy.`,
    field: `Generate the best concise value for the ${target.label} field using the current location context, current draft, and source notes. Return a clean final value only.`,
  } as const

  const improvePrompts = {
    document:
      'Improve the current location document using the existing content as context. Keep what is strong, fix weak or vague copy, and make the result more specific, useful, and consistent.',
    section: `Improve the current ${target.label} section using the existing section content as context. Keep strong facts, rewrite weak content, and make the section more specific, practical, and polished.`,
    field: `Improve the current ${target.label} field using its existing content as context. Keep the useful intent, but rewrite it into a clearer, stronger final value.`,
  } as const

  const basePrompt =
    mode === 'generate'
      ? generatePrompts[target.type]
      : improvePrompts[target.type]

  if (!custom) return basePrompt

  return `${basePrompt}\n\nAdditional direction:\n${custom}`
}

export default function LocationDocumentBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState<LocationDocumentDraft | null>(null)
  const [locations, setLocations] = useState<Awaited<ReturnType<typeof fetchLocationOptions>>>([])
  const [mediaSets, setMediaSets] = useState<Awaited<ReturnType<typeof fetchMediaSetOptions>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<LocationSectionDefinition['id']>('hierarchy')
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null)
  const [aiInstruction, setAiInstruction] = useState('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [lastAiChanges, setLastAiChanges] = useState<string[]>([])

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')
  const payloadId = payloadIdParam ? Number(payloadIdParam) : NaN

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const loadDraft = async () => {
      try {
        if (draftIdParam) {
          const localDraft = findDraftByDraftId(draftIdParam)
          if (cancelled) return
          setDraft(localDraft || createEmptyLocationDocumentDraft())
          return
        }

        if (Number.isFinite(payloadId)) {
          const localDraft = findDraftByPayloadId(payloadId)
          if (localDraft) {
            if (cancelled) return
            setDraft(localDraft)
            return
          }

          const payloadDoc = await fetchLocationById(payloadId, token)
          if (cancelled) return
          setDraft(buildDraftFromPayloadDoc(payloadDoc))
          return
        }

        if (cancelled) return
        setDraft(createEmptyLocationDocumentDraft())
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load builder data')
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
  }, [draftIdParam, payloadId, token])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setOptionsError(null)

    Promise.allSettled([fetchLocationOptions(token), fetchMediaSetOptions(token)])
      .then(([locationResult, mediaResult]) => {
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

        const messages: string[] = []
        if (locationResult.status === 'rejected') {
          messages.push(locationResult.reason instanceof Error ? locationResult.reason.message : 'Failed to load location options')
        }
        if (mediaResult.status === 'rejected') {
          messages.push(mediaResult.reason instanceof Error ? mediaResult.reason.message : 'Failed to load media set options')
        }

        if (messages.length > 0) {
          setOptionsError(messages.join(' '))
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!draft) return
    const timer = window.setTimeout(() => {
      saveDraft(draft)
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!draft) return
    const visibleSections = getVisibleLocationSections(draft.level)
    if (!visibleSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId('hierarchy')
    }
  }, [activeSectionId, draft])

  useEffect(() => {
    if (!draft || locations.length === 0) return

    const resolved = resolveDraftHints(draft, locations, mediaSets)
    if (JSON.stringify(resolved) !== JSON.stringify(draft)) {
      setDraft(resolved)
    }
  }, [draft, locations, mediaSets])

  const visibleSections = useMemo(() => {
    if (!draft) return []
    return getVisibleLocationSections(draft.level)
  }, [draft])

  const activeSection = visibleSections.find((section) => section.id === activeSectionId) || visibleSections[0]
  const modeLabel = draft?.payloadId ? 'Editing Payload' : draftIdParam ? 'Draft' : 'New'

  const updateDraftValue = useCallback((path: string[], value: unknown) => {
    setDraft((current) => {
      if (!current) return current
      return setValueAtPath(current, path, value)
    })
  }, [])

  const handleSaveDraft = useCallback(() => {
    if (!draft) return
    saveDraft(draft)
    setResult('Saved local draft in this browser.')
    setError(null)
  }, [draft])

  const handleSubmit = useCallback(async () => {
    if (!token || !draft) return

    setIsSaving(true)
    setError(null)
    setResult(null)

    try {
      const validationError = validateDraft(draft)
      if (validationError) {
        throw new Error(validationError)
      }

      const unresolvedWarnings = collectUnresolvedHintWarnings(draft, locations, mediaSets)
      if (unresolvedWarnings.length > 0) {
        throw new Error(unresolvedWarnings[0])
      }

      const payloadBody = buildPayloadLocationBody(draft, locations, mediaSets)
      const savedDoc = draft.payloadId
        ? await updateLocation(draft.payloadId, payloadBody, token)
        : await createLocation(payloadBody, token)

      const nextDraft = {
        ...buildDraftFromPayloadDoc(savedDoc),
        draftId: draft.draftId,
        editorModelName: draft.editorModelName,
        aiSourceNotes: draft.aiSourceNotes,
      }

      setDraft(nextDraft)
      saveDraft(nextDraft)
      setSearchParams({
        id: String(savedDoc.id),
        draftId: nextDraft.draftId,
      })
      setResult(draft.payloadId ? 'Updated Payload location document.' : 'Created new Payload location document.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save location')
    } finally {
      setIsSaving(false)
    }
  }, [draft, locations, mediaSets, setSearchParams, token])

  const runAiTarget = useCallback(async (target: AiTarget, mode: AiRunMode, customInstruction = '') => {
    if (!draft) return

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
          modelName: draft.editorModelName,
        })

        const nextDraft = resolveDraftHints(
          {
            ...response.document,
            draftId: draft.draftId,
            payloadId: draft.payloadId,
            editorModelName: draft.editorModelName,
            aiSourceNotes: draft.aiSourceNotes,
            updatedAt: draft.updatedAt,
          },
          locations,
          mediaSets,
        )

        setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
        setDraft(nextDraft)
        setResult(
          mode === 'generate'
            ? `Full document generated with ${response.modelUsed}.`
            : `Full document improved with ${response.modelUsed}.`,
        )
      }

      if (target.type === 'section') {
        const currentValue = getValueAtPath(draft, target.section.path)
        const response = await fillLocationSectionWithAi({
          draft,
          sectionPath: target.section.aiPath || target.section.path.join('.'),
          sectionValue: currentValue && typeof currentValue === 'object' ? currentValue as Record<string, unknown> : null,
          instruction,
          sourceNotes: draft.aiSourceNotes,
          modelName: draft.editorModelName,
        })

        const nextDraft = resolveDraftHints(
          setValueAtPath(draft, target.section.path, response.section),
          locations,
          mediaSets,
        )

        setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
        setDraft(nextDraft)
        setResult(
          mode === 'generate'
            ? `Section generated with ${response.modelUsed}.`
            : `Section improved with ${response.modelUsed}.`,
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
          modelName: draft.editorModelName,
        })

        const nextDraft = setValueAtPath(draft, target.path, response.value)
        setLastAiChanges(diffChangedPaths(draft, nextDraft).slice(0, 12))
        setDraft(nextDraft)
        setResult(
          mode === 'generate'
            ? `Field generated with ${response.modelUsed}.`
            : `Field improved with ${response.modelUsed}.`,
        )
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI generation failed')
    } finally {
      setIsGeneratingAi(false)
    }
  }, [draft, locations, mediaSets])

  const openImproveAi = useCallback((target: AiTarget) => {
    setAiInstruction('')
    setAiTarget(target)
  }, [])

  const handleFieldAiGenerate = useCallback((path: string[], field: ScalarFieldDefinition) => {
    void runAiTarget(
      {
        type: 'field',
        label: field.label,
        path,
        field,
      },
      'generate',
    )
  }, [runAiTarget])

  const handleFieldAiImprove = useCallback((path: string[], field: ScalarFieldDefinition) => {
    openImproveAi({
      type: 'field',
      label: field.label,
      path,
      field,
    })
  }, [openImproveAi])

  const handleRunAiImprovement = useCallback(async () => {
    if (!aiTarget) return

    await runAiTarget(aiTarget, 'improve', aiInstruction)
    setAiTarget(null)
    setAiInstruction('')
  }, [aiInstruction, aiTarget, runAiTarget])

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
          <p className="ldb-error">Unable to initialize the location builder.</p>
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
        <div className="ldb-builder-hero-copy">
          <p className="ldb-eyebrow">Questurian Studio</p>
          <div className="ldb-title-row">
            <h1>{draft.countryName || draft.country || 'New Location Document'}</h1>
            <span className="ldb-mode-badge">{modeLabel}</span>
          </div>
          <p className="ldb-lede">
            Build the full Payload `locations` document, including shared guide sections and audience-specific explore/stay/move content.
          </p>
        </div>

        <div className="ldb-builder-actions">
          <label className="ldb-field ldb-model-field">
            <span className="ldb-label">AI Model</span>
            <select
              className="ldb-select"
              value={draft.editorModelName}
              onChange={(event) => updateDraftValue(['editorModelName'], event.target.value)}
            >
              {EDITOR_ASSIST_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ldb-builder-action-row">
            <button type="button" className="ldb-btn ldb-btn-secondary" onClick={() => navigate('/location-documents')}>
              Back
            </button>
            <button type="button" className="ldb-btn ldb-btn-secondary" onClick={handleSaveDraft}>
              Save Draft
            </button>
            <button
              type="button"
              className="ldb-btn ldb-btn-accent"
              onClick={() => {
                void runAiTarget({ type: 'document', label: 'Full document' }, 'generate')
              }}
            >
              Generate Full Draft
            </button>
            <button
              type="button"
              className="ldb-btn ldb-btn-secondary"
              onClick={() => openImproveAi({ type: 'document', label: 'Full document' })}
            >
              Improve Draft
            </button>
            <button type="button" className="ldb-btn" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving...' : draft.payloadId ? 'Update Payload' : 'Create Payload'}
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="ldb-error">{error}</p> : null}
      {optionsError ? <p className="ldb-error">{optionsError}</p> : null}
      {result ? <p className="ldb-success">{result}</p> : null}

      <section className="ldb-panel ldb-tabs-panel">
        <div className="ldb-tab-list ldb-top-tab-list">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`ldb-tab${section.id === activeSection?.id ? ' is-active' : ''}`}
              onClick={() => setActiveSectionId(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

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
                onClick={() => {
                  void runAiTarget(
                    {
                      type: 'section',
                      label: activeSection.label,
                      section: activeSection,
                    },
                    'generate',
                  )
                }}
              >
                Generate Section
              </button>
              <button
                type="button"
                className="ldb-btn ldb-btn-secondary"
                onClick={() => openImproveAi({
                  type: 'section',
                  label: activeSection.label,
                  section: activeSection,
                })}
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
            locations={locations}
            mediaSets={mediaSets}
            onChange={updateDraftValue}
            onFieldAiGenerate={handleFieldAiGenerate}
            onFieldAiImprove={handleFieldAiImprove}
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
              <button type="button" className="ldb-modal-close" onClick={() => setAiTarget(null)}>
                ×
              </button>
            </div>

            <p className="ldb-ai-modal-copy">
              The current content is already being used as context. Add extra instructions only if you want the AI to improve it in a specific direction.
            </p>

            <textarea
              className="ldb-textarea"
              rows={7}
              value={aiInstruction}
              onChange={(event) => setAiInstruction(event.target.value)}
              placeholder="Optional improvement direction, tone preference, or detail request"
            />

            <div className="ldb-ai-modal-footer">
              <button type="button" className="ldb-btn ldb-btn-secondary" onClick={() => setAiTarget(null)} disabled={isGeneratingAi}>
                Cancel
              </button>
              <button type="button" className="ldb-btn ldb-btn-accent" onClick={handleRunAiImprovement} disabled={isGeneratingAi}>
                {isGeneratingAi ? 'Improving...' : 'Improve with AI'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
