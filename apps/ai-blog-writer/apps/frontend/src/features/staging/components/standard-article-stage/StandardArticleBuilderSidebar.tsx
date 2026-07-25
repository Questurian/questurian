import type { SidebarViewProps } from '../../features/editorial-stage-article/selectors'
import type { StagedArticle } from '../../types'

type StandardArticleBuilderSidebarProps = {
  stagedArticle: StagedArticle
  sidebarProps: SidebarViewProps
  selectedLocationLabel: string
  syncIssues: string[]
  completionPercent: number
  isSynced: boolean
  isPublished: boolean
  isStep1Locked: boolean
  isStep2Locked: boolean
  isStep3Locked: boolean
  seoCoreComplete: boolean
  canManagePublished: boolean
  role: string | null | undefined
  onSubmit: (targetStatus: 'draft' | 'published') => void
}

export function StandardArticleBuilderSidebar({
  stagedArticle,
  sidebarProps,
  selectedLocationLabel,
  syncIssues,
  completionPercent,
  isSynced,
  isPublished,
  isStep1Locked,
  isStep2Locked,
  isStep3Locked,
  seoCoreComplete,
  canManagePublished,
  role,
  onSubmit,
}: StandardArticleBuilderSidebarProps) {
  return (
    <aside className="stl-builder-sidebar">
      {isSynced ? (
        <section className="stl-summary-card">
          <h3>Article Status</h3>
          {syncIssues.length > 0 ? (
            <ul className="stl-summary-list">
              {syncIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : (
            <p className="stl-summary-note">All fields complete.</p>
          )}
        </section>
      ) : (
        <section className="stl-summary-card">
          <h3>Build Progress</h3>
          <div className="stl-progress-track" aria-hidden="true">
            <span className="stl-progress-bar" style={{ width: `${completionPercent}%` }} />
          </div>
          <p className="stl-summary-percent">{completionPercent}% ready</p>
          <ul className="stl-summary-list">
            <li className={isStep1Locked ? 'done' : ''}>
              Setup: {isStep1Locked ? 'Locked' : stagedArticle.in_update_mode ? 'Editing' : 'Incomplete'}
            </li>
            <li className="done">
              Featured image: {isStep2Locked ? 'Saved' : stagedArticle.step2_in_update_mode ? 'Editing' : 'Skippable'}
            </li>
            <li className={isStep3Locked ? 'done' : ''}>
              Content blocks: {isStep3Locked ? 'Locked' : stagedArticle.step3_in_update_mode ? 'Editing' : isStep1Locked ? 'Ready' : 'Blocked'}
            </li>
            <li className={seoCoreComplete ? 'done' : ''}>
              SEO core: {seoCoreComplete ? 'Complete' : 'Missing SEO title or meta description'}
            </li>
          </ul>
        </section>
      )}

      <section className="stl-summary-card stl-summary-card--quick-actions">
        <h3>Sync</h3>
        <div className="stl-summary-actions">
          {!isPublished ? (
            <button
              type="button"
              className="stl-btn stl-btn-success"
              onClick={() => onSubmit('draft')}
              disabled={sidebarProps.isPublishing || syncIssues.length > 0}
            >
              {sidebarProps.isPublishing ? 'Saving...' : 'Save Draft to Payload'}
            </button>
          ) : null}

          <button
            type="button"
            className="stl-btn"
            onClick={() => onSubmit('published')}
            disabled={sidebarProps.isPublishing || syncIssues.length > 0 || !canManagePublished}
          >
            {sidebarProps.isPublishing
              ? 'Publishing...'
              : isPublished
                ? 'Update Published'
                : 'Publish'}
          </button>
        </div>

        {stagedArticle.payloadArticleId ? (
          <p className="stl-summary-note">
            {isPublished
              ? `Published Payload article: #${stagedArticle.payloadArticleId}`
              : `Linked Payload draft: #${stagedArticle.payloadArticleId}`}
          </p>
        ) : (
          <p className="stl-summary-note">First sync will create a draft article in Payload.</p>
        )}

        {!canManagePublished ? (
          <p className="stl-summary-note">
            Publishing requires an editor or admin role (you are signed in as {role ?? 'unknown'}).
          </p>
        ) : null}

        {sidebarProps.publishResult ? (
          <div className={`sab-stage-sync-result ${sidebarProps.publishResult.success ? 'success' : 'error'}`}>
            {sidebarProps.publishResult.message}
          </div>
        ) : null}

        {syncIssues.length > 0 ? (
          <div className="stl-summary-warning">
            <strong>Sync needs attention:</strong>
            <p>{syncIssues[0]}</p>
          </div>
        ) : null}
      </section>

      <section className="stl-summary-card">
        <h3>Draft Details</h3>
        <div className="sab-stage-meta-list">
          <p><strong>Run ID:</strong> {stagedArticle.runId || 'n/a'}</p>
          <p><strong>Location:</strong> {selectedLocationLabel || 'Not set'}</p>
          {stagedArticle.createdBy ? (
            <p><strong>Created by:</strong> {stagedArticle.createdBy.name || stagedArticle.createdBy.email}</p>
          ) : null}
          {stagedArticle.lastEditedBy ? (
            <p><strong>Last edited by:</strong> {stagedArticle.lastEditedBy.name || stagedArticle.lastEditedBy.email}</p>
          ) : null}
          <p><strong>Created:</strong> {stagedArticle.createdAt ? new Date(stagedArticle.createdAt).toLocaleDateString() : 'n/a'}</p>
          <p><strong>Updated:</strong> {stagedArticle.updatedAt ? new Date(stagedArticle.updatedAt).toLocaleDateString() : 'n/a'}</p>
        </div>
      </section>
    </aside>
  )
}
