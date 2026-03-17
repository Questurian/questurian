import type { Location, MediaAsset } from '../../api'
import type { StagedArticle } from '../../types'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import { useAuth } from '../../../../providers/useAuth'
import { EDITOR_MODEL_OPTIONS, resolveEditorModelName } from '../../features/editorial-stage-article/constants'
import { getMediaAssetAltText } from '../../features/editorial-stage-article/media-utils'
import {
  isSeoCoreComplete,
  validateStandardArticleSeoSection,
} from '../../features/editorial-stage-article/services/standard-article-seo.service'
import { getLocationDisplayName } from '../../features/editorial-stage-article/utils/editorial-stage-view.utils'
import {
  buildPrimaryLocationUpdate,
  getSharedNeighborhoodOptions,
  sanitizeSharedNeighborhoods,
} from '../../features/editorial-stage-article/utils/sharedNeighborhoods'
import { isStagedArticleEditingLocked } from '../../utils/staged-article-sync'

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
  onPublish: (targetStatus: 'draft' | 'published') => void
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
  const { user } = useAuth()
  const hasBlockingEditorial = editorialBlockingMessages.length > 0
  const isEditingLocked = isStagedArticleEditingLocked(stagedArticle)
  const canManagePublished = user?.role === 'admin' || user?.role === 'editor'
  const isPublished = stagedArticle.payloadStatus === 'published'
  const isLinkedDraft = Boolean(stagedArticle.payloadArticleId) && !isPublished
  const selectedLocation = locations.find((location) => location.id === stagedArticle.locationId)
  const sharedNeighborhoodOptions = getSharedNeighborhoodOptions(locations, stagedArticle.locationId)
  const selectedSharedNeighborhoods = sanitizeSharedNeighborhoods(
    stagedArticle.sharedNeighborhoods,
    locations,
    stagedArticle.locationId
  )
  const seoSection = stagedArticle.seoSection ?? {
    seoTitle: '',
    metaDescription: '',
    openGraph: {
      title: '',
      description: '',
      imageUrl: '',
      url: '',
    },
    twitterCard: {
      card: 'summary',
      title: '',
      description: '',
      imageUrl: '',
    },
    structuredData: '',
    robots: {
      index: 'index',
      follow: 'follow',
    },
  }
  const publishBlockedReasons = [
    ...(!allFieldsFilled ? missingPublishFields : []),
    ...(!isSeoCoreComplete(seoSection) ? ['SEO title and meta description'] : []),
    ...(!seoSection.structuredData.trim() ? ['Structured Data'] : []),
    ...(!seoSection.openGraph.imageUrl.trim() ? ['Open Graph image URL'] : []),
    ...validateStandardArticleSeoSection({
      seoSection,
      locationLabel: locations.find((location) => location.id === stagedArticle.locationId)?.locationKey,
    }),
  ]
  const canSaveDraft = allFieldsFilled && !hasBlockingEditorial && !isEditingLocked
  const canPublish = canSaveDraft && publishBlockedReasons.length === 0
  const payloadStatusLabel = isPublished
    ? `Published in Payload${stagedArticle.payloadArticleId ? ` · ID ${stagedArticle.payloadArticleId}` : ''}`
    : isLinkedDraft
      ? `Draft synced to Payload${stagedArticle.payloadArticleId ? ` · ID ${stagedArticle.payloadArticleId}` : ''}`
      : null

  return (
    <aside className="stage-article-sidebar">
      <div className="stage-article-sidebar-inner">
        <div className="stage-article-sidebar-section stage-article-sidebar-publish">
          {payloadStatusLabel ? (
            <div className="stage-article-published-notice">{payloadStatusLabel}</div>
          ) : null}

          {!isPublished && (
            <button
              onClick={() => onPublish('draft')}
              disabled={isPublishing || !canSaveDraft}
              className="stage-article-publish-btn payload-action-btn"
            >
              <img
                src={payloadLogoUrl}
                alt=""
                aria-hidden="true"
                className="payload-action-btn-icon"
              />
              {isPublishing ? 'Saving...' :
               !allFieldsFilled ? 'Complete fields below' :
               hasBlockingEditorial ? 'Fix editorial blocks' :
               isLinkedDraft ? 'Update Draft in Payload' :
               'Save Draft to Payload'}
            </button>
          )}

          {canManagePublished ? (
            <button
              onClick={() => onPublish('published')}
              disabled={isPublishing || !canPublish}
              className="stage-article-publish-btn payload-action-btn"
            >
              <img
                src={payloadLogoUrl}
                alt=""
                aria-hidden="true"
                className="payload-action-btn-icon"
              />
              {isPublishing ? 'Publishing...' :
               !canSaveDraft ? 'Complete draft first' :
               isPublished ? 'Update Published' :
               'Publish'}
            </button>
          ) : !isPublished ? (
            <p className="stage-article-publish-checklist-more">Writers can save drafts only.</p>
          ) : (
            <p className="stage-article-publish-checklist-more">Published articles can only be updated by editors or admins.</p>
          )}

          {!seoSection.openGraph.url.trim() ? (
            <p className="stage-article-publish-checklist-more">Set-up urls later</p>
          ) : null}

          {(!canSaveDraft || (canManagePublished && !canPublish)) && (
            <div className="stage-article-publish-checklist">
              {!canSaveDraft && missingPublishFields.length > 0 && (
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
              {canManagePublished && !canPublish && publishBlockedReasons.length > 0 && (
                <>
                  <p className="stage-article-publish-checklist-title">Publish requirements:</p>
                  <ul className="stage-article-publish-checklist-list">
                    {publishBlockedReasons.map((reason, index) => (
                      <li key={`${reason}-${index}`}>{reason}</li>
                    ))}
                  </ul>
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
              {!isEditingLocked && (
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
              {!isEditingLocked && (
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
              disabled={isEditingLocked}
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
            onChange={(event) => {
              const nextLocationId = Number(event.target.value) || undefined
              onUpdateStagedArticle(buildPrimaryLocationUpdate({
                locations,
                nextLocationId,
                sharedNeighborhoods: stagedArticle.sharedNeighborhoods,
              }))
            }}
            className="stage-article-select"
            disabled={isEditingLocked}
          >
            <option value="">-- Select --</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationDisplayName(location)} ({location.level})
              </option>
            ))}
          </select>
        </div>

        {selectedLocation?.level === 'city' ? (
          <div className="stage-article-sidebar-section">
            <label className="stage-article-label">Shared Neighborhoods</label>
            <span className="stage-article-label-hint">
              Optional. Exact neighborhood scoping only.
            </span>
            <select
              multiple
              value={selectedSharedNeighborhoods.map(String)}
              onChange={(event) => {
                const nextSharedNeighborhoods = Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => Number(option.value)
                ).filter((value) => Number.isFinite(value) && value > 0)

                onUpdateStagedArticle({
                  sharedNeighborhoods: sanitizeSharedNeighborhoods(
                    nextSharedNeighborhoods,
                    locations,
                    stagedArticle.locationId
                  ),
                })
              }}
              className="stage-article-select"
              disabled={isEditingLocked || sharedNeighborhoodOptions.length === 0}
              style={{ minHeight: '8rem' }}
            >
              {sharedNeighborhoodOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {getLocationDisplayName(location)}
                </option>
              ))}
            </select>
            {sharedNeighborhoodOptions.length === 0 ? (
              <p className="stage-article-publish-checklist-more">
                No neighborhoods are available for this city yet.
              </p>
            ) : null}
          </div>
        ) : null}

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
            disabled={isEditingLocked}
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
