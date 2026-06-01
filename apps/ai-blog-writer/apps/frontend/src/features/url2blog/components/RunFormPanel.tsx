import { NARRATIVE_FOCUS_PRESETS } from '../constants/pipeline-ui.constants'
import type { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'
import type { Url2BlogExecutionProfile, Url2BlogModel } from '../types/pipeline.types'

type RunFormPanelProps = { run: ReturnType<typeof useUrl2BlogRun> }

export function RunFormPanel({ run }: RunFormPanelProps) {
  const {
    inputMode, setInputMode, url, setUrl, pastedText, setPastedText, inputError, setInputError,
    selectedNarrativeFocusPresetId, setSelectedNarrativeFocusPresetId,
    customNarrativeFocus, setCustomNarrativeFocus, narrativeFocus,
    includeDebug, setIncludeDebug, modelName, setModelName, executionProfile, setExecutionProfile,
    pipelineMutation, statusErrorMessage, mutationErrorMessage, handleSubmit,
  } = run

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
          <label htmlFor="narrative-focus-preset">Narrative / Audience Focus (Optional)</label>
          <select id="narrative-focus-preset" value={selectedNarrativeFocusPresetId}
            onChange={(event) => setSelectedNarrativeFocusPresetId(event.target.value)} className="url2blog-url-field">
            <option value="">No preset (pipeline default)</option>
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
            : 'Applied focus: none (pipeline will use default editorial judgment).'}</p>
        </div>

        <div className="url2blog-url-input">
          <label htmlFor="model-name">Writing Model</label>
          <select id="model-name" value={modelName} onChange={(event) => setModelName(event.target.value as Url2BlogModel)} className="url2blog-url-field">
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview — best quality)</option>
            <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Preview — fast &amp; cheap)</option>
            <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image (Preview — multimodal)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast, less robotic)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deeper, slower)</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash (Lightweight)</option>
          </select>
        </div>
        <div className="url2blog-url-input">
          <label htmlFor="execution-profile">Execution Profile</label>
          <select id="execution-profile" value={executionProfile}
            onChange={(event) => setExecutionProfile(event.target.value as Url2BlogExecutionProfile)} className="url2blog-url-field">
            <option value="standard">Standard (full quality path)</option>
            <option value="lean">Lean (fewer expensive passes)</option>
          </select>
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
    </section>
  )
}
