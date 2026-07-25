import type { EditorialStageStatusView } from '../../features/editorial-stage-article/view-model/types'

type StandardArticleStatusBannersProps = {
  status: EditorialStageStatusView
  localError: string | null
  localResult: string | null
  hasUnsyncedPayloadChanges: boolean
  isPublished: boolean
  isPublishing: boolean
  syncIssues: string[]
  onSubmit: (targetStatus: 'draft' | 'published') => void
}

export function StandardArticleStatusBanners({
  status,
  localError,
  localResult,
  hasUnsyncedPayloadChanges,
  isPublished,
  isPublishing,
  syncIssues,
  onSubmit,
}: StandardArticleStatusBannersProps) {
  return (
    <>
      {status.saveConflict ? (
        <div className="stl-summary-warning" role="alert">
          <strong>Draft changed elsewhere.</strong>
          <p>
            This draft was modified
            {status.saveConflict.current?.lastEditedBy?.email
              ? ` by ${status.saveConflict.current.lastEditedBy.email}`
              : status.saveConflict.current === null
                ? ' (it was deleted)'
                : ' by another user'}
            {' '}since you opened it. Autosave is paused — reload to continue; unsynced local changes will be lost.
          </p>
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={() => window.location.reload()}
          >
            Reload draft
          </button>
        </div>
      ) : null}
      {localError ? <p className="stl-error">{localError}</p> : null}
      {localResult ? <p className="stl-success">{localResult}</p> : null}

      {hasUnsyncedPayloadChanges ? (
        <div className="stl-out-of-sync-banner" role="status">
          <span className="stl-out-of-sync-banner__dot" aria-hidden="true" />
          <span className="stl-out-of-sync-banner__text">
            Out of sync — you have local changes. Sync to Payload to apply them to the live article.
          </span>
          <button
            type="button"
            className="stl-btn stl-out-of-sync-banner__btn"
            onClick={() => onSubmit(isPublished ? 'published' : 'draft')}
            disabled={isPublishing || syncIssues.length > 0}
          >
            {isPublishing ? 'Syncing...' : 'Save & Sync'}
          </button>
        </div>
      ) : null}
    </>
  )
}
