import { useEffect, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ArticleType } from '@shared/types'
import {
  ARTICLE_TONE_OPTIONS,
  Y2B_MODEL_OPTIONS,
  Y2B_WRITER_MODEL_OPTIONS,
  type ArticleToneId,
  type ToneProfile,
  type Y2BModelName,
  type Y2BWriterModel,
} from '../../../shared/api/ai/models'

type UploadPanelProps = {
  youtubeUrl: string
  selectedModel: Y2BModelName
  selectedWritingModel: Y2BWriterModel
  toneId: ArticleToneId
  forcedArticleType: string
  articleTypes: ArticleType[]
  toneProfiles: ToneProfile[]
  runIds: string[]
  activeRunId: string | null
  startPending: boolean
  clearPending: boolean
  startError: string | null
  onYoutubeUrlChange: (value: string) => void
  onModelChange: (model: Y2BModelName) => void
  onWritingModelChange: (model: Y2BWriterModel) => void
  onToneChange: (toneId: ArticleToneId) => void
  onForcedArticleTypeChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onClear: () => void
  onSelectRun: (runId: string) => void
}

type ReferenceOption = {
  id: string
  category: 'Tone' | 'Article type'
  label: string
  description?: string | null
  markdown?: string | null
}

export function UploadPanel({
  youtubeUrl,
  selectedModel,
  selectedWritingModel,
  toneId,
  forcedArticleType,
  articleTypes,
  toneProfiles,
  runIds,
  activeRunId,
  startPending,
  clearPending,
  startError,
  onYoutubeUrlChange,
  onModelChange,
  onWritingModelChange,
  onToneChange,
  onForcedArticleTypeChange,
  onSubmit,
  onClear,
  onSelectRun,
}: UploadPanelProps) {
  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false)
  const [selectedReferenceId, setSelectedReferenceId] = useState('')
  const canSubmit = Boolean(youtubeUrl.trim())
  const submitLabel = startPending ? 'Starting...' : 'Start pipeline'
  const selectedTypeGuideline =
    articleTypes.find((t) => t.name === forcedArticleType)?.guideline ?? null
  const toneReferenceOptions: ReferenceOption[] = toneProfiles.map((tone) => ({
    id: `tone-${tone.id}`,
    category: 'Tone',
    label: tone.label,
    description: tone.description,
    markdown: tone.instructions,
  }))
  const articleTypeReferenceOptions: ReferenceOption[] = articleTypes.map((type) => ({
    id: `article-type-${type.id}`,
    category: 'Article type',
    label: type.name,
    description: type.definition,
    markdown: type.guideline || type.definition,
  }))
  const referenceOptions = [...toneReferenceOptions, ...articleTypeReferenceOptions]
  const selectedReference =
    referenceOptions.find((option) => option.id === selectedReferenceId) ?? referenceOptions[0] ?? null
  const selectedReferenceMarkdownRaw =
    selectedReference?.markdown?.trim() || selectedReference?.description?.trim() || 'No reference content loaded.'
  const selectedReferenceMarkdown = selectedReference
    ? selectedReferenceMarkdownRaw
      .split('\n')
      .filter((line, index) => {
        if (index > 1) return true
        const normalizedLine = line.replace(/^#{1,6}\s*/, '').trim().toLowerCase()
        return normalizedLine !== selectedReference.label.trim().toLowerCase()
      })
      .join('\n')
      .trim() || selectedReferenceMarkdownRaw
    : selectedReferenceMarkdownRaw

  const openReferenceModal = () => {
    setSelectedReferenceId((current) =>
      referenceOptions.some((option) => option.id === current) ? current : referenceOptions[0]?.id ?? '',
    )
    setIsReferenceModalOpen(true)
  }

  useEffect(() => {
    if (!isReferenceModalOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsReferenceModalOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isReferenceModalOpen])

  return (
    <section className="panel upload">
      <div className="panel-header">
        <h2>Start YouTube2Blog</h2>
        <p>
          Paste a YouTube video URL and the app will extract the transcript, then generate the
          article end-to-end.
        </p>
      </div>
      <form className="panel-body" onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="youtube-url-input">YouTube video URL</label>
          <input
            id="youtube-url-input"
            type="url"
            value={youtubeUrl}
            onChange={(event) => onYoutubeUrlChange(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label htmlFor="y2b-model-select">AI Model</label>
          <select
            id="y2b-model-select"
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value as Y2BModelName)}
          >
            {Y2B_MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="y2b-writing-model-select">Writer Model</label>
          <select
            id="y2b-writing-model-select"
            value={selectedWritingModel}
            onChange={(event) => onWritingModelChange(event.target.value as Y2BWriterModel)}
          >
            {Y2B_WRITER_MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="y2b-tone-select">Tone</label>
          <select
            id="y2b-tone-select"
            value={toneId}
            onChange={(event) => onToneChange(event.target.value as ArticleToneId)}
          >
            {ARTICLE_TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {ARTICLE_TONE_OPTIONS.find((opt) => opt.value === toneId)?.description}
          </p>
        </div>

        {articleTypes.length > 0 ? (
          <div className="form-group">
            <label htmlFor="forced-article-type-select">Article type (optional)</label>
            <select
              id="forced-article-type-select"
              value={forcedArticleType}
              onChange={(event) => onForcedArticleTypeChange(event.target.value)}
            >
              <option value="">Auto-detect</option>
              {articleTypes.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
            {selectedTypeGuideline ? (
              <div className="guideline-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTypeGuideline}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="reference-launch">
          <div>
            <h3>Writing references</h3>
            <p>Open tone profiles and article-type guidelines when you need the full notes.</p>
          </div>
          <button
            type="button"
            className="reference-launch__button"
            onClick={openReferenceModal}
          >
            View references
          </button>
        </div>

        <div className="button-row">
          <button type="submit" disabled={!canSubmit || startPending}>
            {submitLabel}
          </button>
          <button type="button" className="clear-btn" onClick={onClear} disabled={clearPending}>
            {clearPending ? 'Clearing...' : 'Clear'}
          </button>
        </div>
        {startError ? <p className="error">{startError}</p> : null}
        {runIds.length > 1 ? (
          <div className="run-list">
            {runIds.map((runId) => (
              <button
                type="button"
                key={runId}
                className={runId === activeRunId ? 'run active' : 'run'}
                onClick={() => onSelectRun(runId)}
              >
                {runId}
              </button>
            ))}
          </div>
        ) : null}
      </form>
      {isReferenceModalOpen ? (
        <div
          className="reference-modal"
          role="presentation"
          onMouseDown={() => setIsReferenceModalOpen(false)}
        >
          <div
            className="reference-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="writing-references-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="reference-modal__header">
              <div>
                <p className="reference-modal__eyebrow">Reference library</p>
                <h2 id="writing-references-title">Writing references</h2>
                <p>Read-only tone profiles and article-type guidelines.</p>
              </div>
              <button
                type="button"
                className="reference-modal__close"
                onClick={() => setIsReferenceModalOpen(false)}
                aria-label="Close writing references"
              >
                Close
              </button>
            </div>
            <div className="reference-modal__body">
              <label className="reference-modal__picker" htmlFor="writing-reference-select">
                <span>Choose a reference</span>
                <select
                  id="writing-reference-select"
                  value={selectedReference?.id ?? ''}
                  onChange={(event) => setSelectedReferenceId(event.target.value)}
                  disabled={referenceOptions.length === 0}
                >
                  {toneReferenceOptions.length ? (
                    <optgroup label="Tone profiles">
                      {toneReferenceOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {articleTypeReferenceOptions.length ? (
                    <optgroup label="Article types">
                      {articleTypeReferenceOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>

              {selectedReference ? (
                <article className="reference-modal__content">
                  <header className="reference-modal__content-header">
                    <p className="reference-modal__type">{selectedReference.category}</p>
                    <h3>{selectedReference.label}</h3>
                    {selectedReference.description ? (
                      <p className="reference-modal__description">{selectedReference.description}</p>
                    ) : null}
                  </header>
                  <div className="reference-modal__markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedReferenceMarkdown}</ReactMarkdown>
                  </div>
                </article>
              ) : (
                <p className="reference-modal__empty">No writing references loaded.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
