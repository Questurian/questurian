import type { SingleTypeListicleDraft } from '../../types'

type BuilderPublishPanelProps = {
  draft: SingleTypeListicleDraft
  isSaving: boolean
  updateDraft: (next: Partial<SingleTypeListicleDraft>) => void
  onSaveDraft: () => Promise<void>
  onPublish: () => Promise<void>
}

export function BuilderPublishPanel({ draft, isSaving, updateDraft, onSaveDraft, onPublish }: BuilderPublishPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 5</span> Publish
        </h2>
      </div>

      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
          <span>Status</span>
          <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as 'draft' | 'published' })}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>

        <label className="stl-field">
          <span>Article Type</span>
          <input value={draft.articleType} disabled readOnly />
        </label>
      </div>

      <div className="stl-inline-actions">
        <button type="button" className="stl-btn" onClick={() => void onSaveDraft()} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Draft'}
        </button>
        <button type="button" className="stl-btn stl-btn-success" onClick={() => void onPublish()} disabled={isSaving}>
          {isSaving ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </section>
  )
}
