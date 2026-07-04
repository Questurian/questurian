import {
  ARTICLE_TONE_OPTIONS,
  type ArticleToneId,
} from '../../../shared/api/ai/models'
import { MarkdownCatalogBox } from '../../../components/MarkdownCatalogBox'
import {
  NARRATIVE_FOCUS_PRESETS,
  URL2BLOG_WRITER_MODEL_OPTIONS,
} from '../constants/pipeline-ui.constants'
import type { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'
import type { Url2BlogExecutionProfile, Url2BlogWriterModel } from '../types/pipeline.types'
import { FailedRunDebug } from './debug/FailedRunDebug'

type RunFormPanelProps = { run: ReturnType<typeof useUrl2BlogRun> }

export function RunFormPanel({ run }: RunFormPanelProps) {
  const {
    inputMode, setInputMode, url, setUrl, pastedText, setPastedText, inputError, setInputError,
    handleSubmit,
  } = run.input
  const {
    selectedNarrativeFocusPresetId, setSelectedNarrativeFocusPresetId,
    customNarrativeFocus, setCustomNarrativeFocus, narrativeFocus,
    toneId, setToneId, toneProfiles, articleTypes,
    includeDebug, setIncludeDebug, executionProfile, setExecutionProfile,
    writingModel, setWritingModel,
  } = run.config
  const { pipelineMutation, statusErrorMessage, mutationErrorMessage, failedRunDebug } = run.pipeline

  return (
    <section className="url2blog-panel u2b-wizard-panel">
      <div className="url2blog-panel-header">
        <h2>Run URL2Blog v2</h2>
        <p>{inputMode === 'url'
          ? 'Paste an article URL and get a clean markdown output.'
          : 'Paste raw article text — we clean it up and convert it to a guideline-aligned draft.'}</p>
      </div>
      <form className="url2blog-panel-body" onSubmit={handleSubmit}>
        <div className="url2blog-url-input">
          <label>Input Mode</label>
          <div className="url2blog-mode-toggle">
            <button type="button" className={`url2blog-mode-btn${inputMode === 'url' ? ' active' : ''}`}
              onClick={() => { setInputMode('url'); setInputError(null) }}>Article URL</button>
            <button type="button" className={`url2blog-mode-btn${inputMode === 'text' ? ' active' : ''}`}
              onClick={() => { setInputMode('text'); setInputError(null) }}>Paste Text</button>
          </div>
        </div>

        {inputMode === 'url' ? (
          <div className="url2blog-url-input">
            <label htmlFor="article-url">Article URL</label>
            <input id="article-url" type="text" inputMode="url" placeholder="https://example.com/article"
              value={url} onChange={(event) => { setUrl(event.target.value); if (inputError) setInputError(null) }}
              className="url2blog-url-field" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            {inputError ? <p className="url2blog-error">{inputError}</p> : null}
          </div>
        ) : (
          <div className="url2blog-url-input">
            <label htmlFor="article-pasted-text">Pasted Article Text</label>
            <p className="url2blog-focus-preview">Copy the full page content from any article — navigation, ads, and sidebar clutter will be stripped automatically.</p>
            <textarea id="article-pasted-text" placeholder="Paste the raw article text here. Messy copy is fine — the pipeline will clean it up."
              value={pastedText} onChange={(event) => { setPastedText(event.target.value); if (inputError) setInputError(null) }}
              className="url2blog-url-field url2blog-text-area" rows={10} autoFocus spellCheck={false} />
            {inputError ? <p className="url2blog-error">{inputError}</p> : null}
          </div>
        )}

        <div className="url2blog-url-input">
          <label htmlFor="narrative-focus-preset">Narrative / Audience Focus</label>
          <select id="narrative-focus-preset" value={selectedNarrativeFocusPresetId}
            onChange={(event) => setSelectedNarrativeFocusPresetId(event.target.value)} className="url2blog-url-field">
            <option value="">Auto — pipeline picks from the article (recommended)</option>
            {NARRATIVE_FOCUS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <div className="url2blog-focus-grid" role="listbox" aria-label="Narrative focus quick picks">
            {NARRATIVE_FOCUS_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => setSelectedNarrativeFocusPresetId(preset.id)}
                className={`url2blog-focus-chip${selectedNarrativeFocusPresetId === preset.id ? ' active' : ''}`}
                aria-selected={selectedNarrativeFocusPresetId === preset.id}>{preset.label}</button>
            ))}
          </div>
          <input id="narrative-focus-custom" type="text" placeholder="Optional custom add-on. Example: Keep tone grounded and avoid hype language."
            value={customNarrativeFocus} onChange={(event) => setCustomNarrativeFocus(event.target.value)} className="url2blog-url-field" />
          <p className="url2blog-focus-preview">{narrativeFocus
            ? `Applied focus: ${narrativeFocus}`
            : 'Applied focus: auto — the pipeline analyzes the article and selects the best focus during Stage 2.'}</p>
        </div>

        <div className="url2blog-url-input">
          <label htmlFor="url2blog-tone">Tone</label>
          <select id="url2blog-tone" value={toneId}
            onChange={(event) => setToneId(event.target.value as ArticleToneId)}
            className="url2blog-url-field">
            {ARTICLE_TONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="url2blog-focus-preview">
            {ARTICLE_TONE_OPTIONS.find((option) => option.value === toneId)?.description}
          </p>
        </div>

        <div className="url2blog-url-input">
          <label htmlFor="writing-model">Writing Model</label>
          <select id="writing-model" value={writingModel}
            onChange={(event) => setWritingModel(event.target.value as Url2BlogWriterModel)}
            className="url2blog-url-field">
            {URL2BLOG_WRITER_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="url2blog-focus-preview">
            Model used for the compose and editorial writing stages. Extraction and
            classification always run on the fast base model.
          </p>
        </div>
        <div className="url2blog-url-input">
          <label htmlFor="execution-profile">Execution Profile</label>
          <select id="execution-profile" value={executionProfile}
            onChange={(event) => setExecutionProfile(event.target.value as Url2BlogExecutionProfile)} className="url2blog-url-field">
            <option value="standard">Standard (full quality path)</option>
            <option value="lean">Lean (fewer expensive passes)</option>
          </select>
        </div>

        <div className="url2blog-reference-grid">
          <MarkdownCatalogBox
            title="Tone Reference"
            intro="Read-only tone profiles. Pipeline uses the Tone field above."
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
            intro="Read-only article-type guidelines. AI still chooses the best match."
            items={articleTypes.map((type) => ({
              id: type.id,
              label: type.name,
              description: type.definition,
              markdown: type.guideline || type.definition,
            }))}
            emptyLabel="No article types loaded."
          />
        </div>
        <div className="url2blog-url-input">
          <label htmlFor="include-debug">Debug Trace</label>
          <label className="url2blog-debug-checkbox" htmlFor="include-debug">
            <input id="include-debug" type="checkbox" checked={includeDebug} onChange={(event) => setIncludeDebug(event.target.checked)} />
            <span>Capture full stage inputs, prompts, and raw model responses</span>
          </label>
        </div>
        <div className="url2blog-button-row">
          <button type="submit" className="url2blog-submit-btn"
            disabled={(inputMode === 'url' ? !url.trim() : !pastedText.trim()) || pipelineMutation.isPending}>
            {inputMode === 'text' ? 'Clean & Run Pipeline' : 'Run Simple Pipeline'}
          </button>
        </div>
        {pipelineMutation.isError ? <p className="url2blog-error">
          {statusErrorMessage || mutationErrorMessage || 'Pipeline failed. Check backend logs.'}
        </p> : null}
      </form>
      {pipelineMutation.isError && failedRunDebug ? <FailedRunDebug debug={failedRunDebug} /> : null}
    </section>
  )
}
