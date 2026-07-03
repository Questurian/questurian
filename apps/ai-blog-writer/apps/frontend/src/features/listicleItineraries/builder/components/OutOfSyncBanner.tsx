type OutOfSyncBannerProps = {
  isPublishedPayload: boolean
  isSaving: boolean
  onSync: () => void
}

export function OutOfSyncBanner({
  isPublishedPayload,
  isSaving,
  onSync,
}: OutOfSyncBannerProps) {
  return (
    <div className="stl-out-of-sync-banner" role="status">
      <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
      <span className="stl-out-of-sync-banner__text">
        Out of sync - you have local changes. Sync to Payload to apply them to the {isPublishedPayload ? 'live published' : 'Payload'} itinerary.
      </span>
      <button
        type="button"
        className="stl-btn stl-out-of-sync-banner__btn"
        onClick={onSync}
        disabled={isSaving}
      >
        {isSaving ? 'Syncing...' : isPublishedPayload ? 'Update Published' : 'Save & Sync'}
      </button>
    </div>
  )
}
