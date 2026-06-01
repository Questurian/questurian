import type { Prompt2BlogGuidelinePreviewResponse } from '../../api'

export function GuidelinePreviewPanel({ loading, preview }: { loading: boolean; preview: Prompt2BlogGuidelinePreviewResponse | null }) {
  return <section className="p2b-panel">
    <div className="p2b-panel-header"><h2>Guideline Preview</h2><p>Loaded from selected article type guideline markdown.</p></div>
    <div className="p2b-panel-body">
      {loading && <p>Loading guideline preview...</p>}
      {!loading && !preview && <p className="p2b-guideline-hint">Select an article type to view guideline details.</p>}
      {preview && <><p><strong>{preview.name}</strong>{preview.guideline_file ? ` (${preview.guideline_file})` : ''}</p><div className="p2b-raw-json"><pre>{preview.guideline}</pre></div></>}
    </div>
  </section>
}
