import { useMemo, useState } from 'react'
import {
  buildItinerariesPipelineChatPrompt,
  DEFAULT_ITINERARY_TITLE_MODEL,
  generateItineraryTitles,
  getItineraryPipelineTypeMarkdown,
  ITINERARY_PIPELINE_TYPE_OPTIONS,
  ITINERARY_TITLE_MODEL_OPTIONS,
  resolveItineraryTitleModelName,
  type ItineraryPipelineTypeId,
  type ItineraryTitleModelName,
} from '../../../itinerariesPipeline'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../constants/builder-options.constants'

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'done'; titles: string[]; modelUsed: string | null }
  | { kind: 'error'; message: string }

type ItineraryTitlePipelineButtonProps = {
  /** Resolved location label used in the prompt; null when no location is selected. */
  locationLabel: string | null
  /** Pre-fills the itinerary length, kept in sync with the Setup day count. */
  defaultDayCount: number
  /** Applies the chosen title back onto the draft. */
  onApply: (title: string) => void
  /** When set, the trigger button is disabled and shows this as a tooltip. */
  disabledReason?: string
}

/** Parse the pipeline's numbered list (e.g. "1. Some Title") into clean title strings. */
function parseTitleOptions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+[.)]\s*(.*)$/)
      return (match ? match[1] : line).trim()
    })
    .filter(Boolean)
}

export function ItineraryTitlePipelineButton({
  locationLabel,
  defaultDayCount,
  onApply,
  disabledReason,
}: ItineraryTitlePipelineButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [itineraryType, setItineraryType] = useState<ItineraryPipelineTypeId>(
    ITINERARY_PIPELINE_TYPE_OPTIONS[0].id,
  )
  const [dayCount, setDayCount] = useState(defaultDayCount)
  const [model, setModel] = useState<ItineraryTitleModelName>(DEFAULT_ITINERARY_TITLE_MODEL)
  const [keywords, setKeywords] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const isGenerating = phase.kind === 'generating'

  const selectedTypeOption = useMemo(
    () => ITINERARY_PIPELINE_TYPE_OPTIONS.find((opt) => opt.id === itineraryType),
    [itineraryType],
  )
  const typeMarkdown = useMemo(
    () => getItineraryPipelineTypeMarkdown(itineraryType),
    [itineraryType],
  )

  const handleOpen = () => {
    setDayCount(defaultDayCount)
    setIsOpen(true)
  }

  const handleClose = () => {
    if (isGenerating) return
    setIsOpen(false)
    setKeywords('')
    setAdditionalContext('')
    setPhase({ kind: 'idle' })
  }

  const handleGenerate = async () => {
    if (!locationLabel) {
      setPhase({ kind: 'error', message: 'Select a location in Setup before generating titles.' })
      return
    }

    const selectedType = ITINERARY_PIPELINE_TYPE_OPTIONS.find((opt) => opt.id === itineraryType)
    if (!selectedType) return

    setPhase({ kind: 'generating' })

    const prompt = buildItinerariesPipelineChatPrompt({
      typeLabel: selectedType.label,
      locationLabel,
      dayCount,
      guidelineMarkdown: getItineraryPipelineTypeMarkdown(itineraryType),
      keywords: keywords.trim() || undefined,
      additionalContext: additionalContext.trim() || undefined,
    })

    try {
      const { text, model_used: modelUsed } = await generateItineraryTitles({
        prompt,
        modelName: model,
      })
      const titles = parseTitleOptions(text)
      if (titles.length === 0) throw new Error('The title pipeline returned no usable titles.')
      setPhase({ kind: 'done', titles, modelUsed })
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Title pipeline failed. Try again.',
      })
    }
  }

  const handleApply = (title: string) => {
    onApply(title)
    handleClose()
  }

  return (
    <>
      <button
        type="button"
        className="block-markdown-ai-btn subtle stl-ai-title-trigger"
        onClick={handleOpen}
        disabled={!!disabledReason}
        title={disabledReason}
      >
        AI
      </button>

      {isOpen && (
        <div className="stl-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
          <div className="stl-modal stl-ai-title-modal stl-title-pipeline-modal">
            <div className="stl-ai-title-modal-header">
              <h3>Generate Title with AI</h3>
              <button
                type="button"
                className="stl-ai-title-modal-close"
                onClick={handleClose}
                disabled={isGenerating}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="stl-ai-title-preview">
              <span className="stl-ai-title-preview-label">Location</span>
              <p className="stl-ai-title-preview-text">{locationLabel ?? 'No location selected'}</p>
            </div>

            <div className="stl-grid stl-grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="stl-field">
                <span>Type</span>
                <select
                  value={itineraryType}
                  disabled={isGenerating}
                  onChange={(e) => setItineraryType(e.target.value as ItineraryPipelineTypeId)}
                >
                  {ITINERARY_PIPELINE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stl-field">
                <span>Itinerary length</span>
                <select
                  value={dayCount}
                  disabled={isGenerating}
                  onChange={(e) => setDayCount(Number(e.target.value))}
                >
                  {ITINERARY_DAY_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'day' : 'days'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedTypeOption ? (
              <details className="stl-title-pipeline-guideline" open>
                <summary>
                  <span className="stl-title-pipeline-guideline-label">
                    {selectedTypeOption.label} guideline
                  </span>
                  <span className="stl-title-pipeline-guideline-file">
                    {selectedTypeOption.filename}
                  </span>
                </summary>
                <pre className="stl-title-pipeline-guideline-body">{typeMarkdown}</pre>
              </details>
            ) : null}

            <label className="stl-field" style={{ marginTop: '0.75rem' }}>
              <span>Keywords (optional)</span>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. rooftop bars, michelin, hidden gems"
                disabled={isGenerating}
              />
            </label>

            <label className="stl-field" style={{ marginTop: '0.75rem' }}>
              <span>Extra context / direction (optional)</span>
              <textarea
                rows={3}
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void handleGenerate()
                  }
                }}
                placeholder="e.g. aim it at couples, keep it upscale, avoid clickbait superlatives..."
                disabled={isGenerating}
              />
            </label>

            <label className="stl-field" style={{ marginTop: '0.75rem' }}>
              <span>Model</span>
              <select
                value={model}
                disabled={isGenerating}
                onChange={(e) => setModel(resolveItineraryTitleModelName(e.target.value))}
              >
                {ITINERARY_TITLE_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {phase.kind === 'error' && (
              <p className="stl-error stl-ai-title-error">{phase.message}</p>
            )}

            {phase.kind === 'done' && (
              <div className="stl-title-pipeline-results">
                <span className="stl-ai-title-preview-label">
                  Pick a title{phase.modelUsed ? ` (model: ${phase.modelUsed})` : ''}
                </span>
                <ul className="stl-title-pipeline-options">
                  {phase.titles.map((title, index) => (
                    <li key={`${index}-${title}`}>
                      <button
                        type="button"
                        className="stl-title-pipeline-option"
                        onClick={() => handleApply(title)}
                      >
                        {title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="stl-inline-actions stl-ai-title-actions">
              <button
                type="button"
                className="stl-btn"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !locationLabel}
              >
                {isGenerating
                  ? 'Generating…'
                  : phase.kind === 'done'
                    ? 'Regenerate'
                    : 'Generate titles'}
              </button>
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={handleClose}
                disabled={isGenerating}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
