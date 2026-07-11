type OutOfSyncBannerProps = {
  isPublishedPayload: boolean
  isSaving: boolean
  hasLocalChanges: boolean
  hasMediaDrift: boolean
  onSync: () => void
}

function bannerMessage(
  isPublishedPayload: boolean,
  hasLocalChanges: boolean,
  hasMediaDrift: boolean,
): string {
  const target = isPublishedPayload ? 'live published' : 'Payload'

  if (hasLocalChanges && hasMediaDrift) {
    return `Out of sync - you have local changes and Location Manager has newly reviewed images for stops in this itinerary. Sync to Payload to apply both to the ${target} itinerary.`
  }
  if (hasMediaDrift) {
    return `Out of sync - Location Manager added newly reviewed images for stops in this itinerary since the last sync. Sync to Payload to bring the ${target} itinerary up to date.`
  }
  return `Out of sync - you have local changes. Sync to Payload to apply them to the ${target} itinerary.`
}

export function OutOfSyncBanner({
  isPublishedPayload,
  isSaving,
  hasLocalChanges,
  hasMediaDrift,
  onSync,
}: OutOfSyncBannerProps) {
  return (
    <div className="stl-out-of-sync-banner" role="status">
      <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
      <span className="stl-out-of-sync-banner__text">
        {bannerMessage(isPublishedPayload, hasLocalChanges, hasMediaDrift)}
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
