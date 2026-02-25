import type { Location, MediaAsset } from '../../api'
import type { StagedArticle } from '../../types'
import { EDITOR_MODEL_OPTIONS, resolveEditorModelName } from '../../features/editorial-stage-article/constants'
import { getMediaAssetAltText } from '../../features/editorial-stage-article/media-utils'
import { getLocationDisplayName } from '../../features/editorial-stage-article/utils/editorial-stage-view.utils'

type PublishResult = { success: boolean; message: string } | null

type EditorialSidebarProps = {
  stagedArticle: StagedArticle
  isPublishing: boolean
  allFieldsFilled: boolean
  missingPublishFields: string[]
  editorialBlockingMessages: string[]
  publishResult: PublishResult
  featuredImageRequirementLabel: string
  selectedFeaturedImage: MediaAsset | null
  getImageUrl: (asset: MediaAsset) => string
  onOpenFeaturedImageModal: () => void
  locations: Location[]
  onUpdateStagedArticle: (updates: Partial<StagedArticle>) => void
  onPublish: () => void
}

export function EditorialSidebar({
  stagedArticle,
  isPublishing,
  allFieldsFilled,
  missingPublishFields,
  editorialBlockingMessages,
  publishResult,
  featuredImageRequirementLabel,
  selectedFeaturedImage,
  getImageUrl,
  onOpenFeaturedImageModal,
  locations,
  onUpdateStagedArticle,
  onPublish,
}: EditorialSidebarProps) {
  const hasBlockingEditorial = editorialBlockingMessages.length > 0
  const canPublish = allFieldsFilled && !hasBlockingEditorial

  return (
    <aside className="stage-article-sidebar">
      <div className="stage-article-sidebar-inner">
        <div className="stage-article-sidebar-section stage-article-sidebar-publish">
          {!stagedArticle.publishedToPayload ? (
            <button
              onClick={onPublish}
              disabled={isPublishing || !canPublish}
              className="stage-article-publish-btn"
            >
              {isPublishing ? 'Publishing...' :
               !allFieldsFilled ? 'Complete fields below' :
               hasBlockingEditorial ? 'Fix editorial blocks' :
               'Publish to Payload'}
            </button>
          ) : (
            <div className="stage-article-published-notice">
              Published to Payload
              {stagedArticle.payloadArticleId && (
                <span> &middot; ID {stagedArticle.payloadArticleId}</span>
              )}
            </div>
          )}

          {!stagedArticle.publishedToPayload && !canPublish && (
            <div className="stage-article-publish-checklist">
              {missingPublishFields.length > 0 && (
                <>
                  <p className="stage-article-publish-checklist-title">Missing required fields:</p>
                  <ul className="stage-article-publish-checklist-list">
                    {missingPublishFields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </>
              )}
              {hasBlockingEditorial && (
                <>
                  <p className="stage-article-publish-checklist-title">Fix editorial blocks before publish:</p>
                  <ul className="stage-article-publish-checklist-list">
                    {editorialBlockingMessages.slice(0, 3).map((message, index) => (
                      <li key={`${message}-${index}`}>{message}</li>
                    ))}
                  </ul>
                  {editorialBlockingMessages.length > 3 && (
                    <p className="stage-article-publish-checklist-more">
                      +{editorialBlockingMessages.length - 3} more block issues
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {publishResult && (
            <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
              {publishResult.message}
            </div>
          )}
        </div>

        <div className="stage-article-sidebar-section">
          <label className="stage-article-label">
            Featured Image <span className="required">*</span>
          </label>
          <span className="stage-article-label-hint">
            Required: {featuredImageRequirementLabel}
          </span>

          {selectedFeaturedImage ? (
            <div className="stage-article-featured-image">
              <img
                src={getImageUrl(selectedFeaturedImage)}
                alt={getMediaAssetAltText(selectedFeaturedImage) || selectedFeaturedImage.filename}
              />
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  onClick={onOpenFeaturedImageModal}
                  className="stage-article-change-btn"
                >
                  Change
                </button>
              )}
            </div>
          ) : stagedArticle.featuredImageId ? (
            <div className="stage-article-featured-image-pending">
              <p>Featured image selected (ID {stagedArticle.featuredImageId}). Preview will load shortly.</p>
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  onClick={onOpenFeaturedImageModal}
                  className="stage-article-change-btn-inline"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenFeaturedImageModal}
              className="stage-article-image-placeholder"
              disabled={stagedArticle.publishedToPayload}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span>Select image</span>
            </button>
          )}
        </div>

        <div className="stage-article-sidebar-section">
          <label className="stage-article-label">
            Location <span className="required">*</span>
          </label>
          <select
            value={stagedArticle.locationId || ''}
            onChange={(event) => onUpdateStagedArticle({ locationId: Number(event.target.value) || undefined })}
            className="stage-article-select"
            disabled={stagedArticle.publishedToPayload}
          >
            <option value="">-- Select --</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationDisplayName(location)} ({location.level})
              </option>
            ))}
          </select>
        </div>

        <div className="stage-article-sidebar-section">
          <label className="stage-article-label">
            AI Model
          </label>
          <select
            value={resolveEditorModelName(stagedArticle.editorModelName)}
            onChange={(event) => onUpdateStagedArticle({
              editorModelName: resolveEditorModelName(event.target.value),
            })}
            className="stage-article-select"
            disabled={stagedArticle.publishedToPayload}
          >
            {EDITOR_MODEL_OPTIONS.map((modelOption) => (
              <option key={modelOption.value} value={modelOption.value}>
                {modelOption.label}
              </option>
            ))}
          </select>
        </div>

        <div className="stage-article-sidebar-section stage-article-info-box">
          <p><strong>Run ID:</strong> {stagedArticle.runId}</p>
          <p><strong>Created:</strong> {new Date(stagedArticle.createdAt).toLocaleDateString()}</p>
          <p><strong>Updated:</strong> {new Date(stagedArticle.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>
    </aside>
  )
}
