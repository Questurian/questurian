import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ArticleType } from '@shared/types'
import { MarkdownCatalogBox } from '../../../components/MarkdownCatalogBox'
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
  const canSubmit = Boolean(youtubeUrl.trim())
  const submitLabel = startPending ? 'Starting...' : 'Start pipeline'
  const selectedTypeGuideline =
    articleTypes.find((t) => t.name === forcedArticleType)?.guideline ?? null

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

        <div className="reference-grid">
          <MarkdownCatalogBox
            title="Tone Reference"
            intro="Read-only tone profiles. Pipeline uses the selected Tone field above."
            items={toneProfiles.map((tone) => ({
              id: tone.id,
              label: tone.label,
              description: tone.description,
              markdown: tone.instructions,
            }))}
            emptyLabel="No tone profiles loaded."
          />
          <MarkdownCatalogBox
            title="Article Type Reference"
            intro="Read-only article-type guidelines. Auto-detect remains available."
            items={articleTypes.map((type) => ({
              id: type.id,
              label: type.name,
              description: type.definition,
              markdown: type.guideline || type.definition,
            }))}
            emptyLabel="No article types loaded."
          />
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
    </section>
  )
}
