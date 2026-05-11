import type { ListicleItineraryDraft } from '../../types'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'

type BuilderPublishPanelProps = {
  draft: ListicleItineraryDraft
  isSaving: boolean
  onSaveLocalDraft: () => Promise<void>
  onSyncToPayload: () => Promise<void>
}

export function BuilderPublishPanel({ draft, isSaving, onSaveLocalDraft, onSyncToPayload }: BuilderPublishPanelProps) {
  const isPublishedPayload = draft.payloadStatus === 'published' || draft.status === 'published'
  const statusLabel = isPublishedPayload ? 'Published (live Payload document)' : 'Draft (editor review)'
  const syncLabel = isPublishedPayload ? 'Update Published Payload' : 'Sync to Payload'

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 5</span> Sync
        </h2>
        <span className={`stl-status stl-status-${isPublishedPayload ? 'published' : 'draft'}`}>
          {isPublishedPayload ? 'Published' : 'Draft'}
        </span>
      </div>

      {isPublishedPayload ? (
        <div className="stl-publish-notice" role="status">
          <strong>Published document</strong>
          <span>Any sync from this point updates the live Payload version.</span>
        </div>
      ) : null}

      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
          <span>Status</span>
          <input value={statusLabel} disabled readOnly />
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
        <button type="button" className="stl-btn stl-btn-success payload-action-btn" onClick={() => void onSyncToPayload()} disabled={isSaving}>
          <img src={payloadLogoUrl} alt="" aria-hidden="true" className="payload-action-btn-icon" />
          {isSaving ? 'Syncing...' : syncLabel}
        </button>
      </div>
    </section>
  )
}
