import type { ListicleItineraryDraft } from '../../types'

type BuilderPublishPanelProps = {
  draft: ListicleItineraryDraft
  isSaving: boolean
  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
}

export function BuilderPublishPanel({ draft, isSaving, onSaveLocalDraft, onSyncToPayload }: BuilderPublishPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 5</span> Sync
        </h2>
      </div>

      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
          <span>Status</span>
          <input value="Draft (editor review)" disabled readOnly />
        </label>

        <label className="stl-field">
          <span>Article Type</span>
          <input value={draft.articleType} disabled readOnly />
        </label>
      </div>

      <div className="stl-inline-actions">
        <button type="button" className="stl-btn" onClick={() => void onSaveLocalDraft()} disabled={isSaving}>
          Save Local Draft (Browser)
        </button>
        <button type="button" className="stl-btn stl-btn-success" onClick={() => void onSyncToPayload()} disabled={isSaving}>
          {isSaving ? 'Syncing...' : 'Sync to Payload'}
        </button>
      </div>
    </section>
  )
}
