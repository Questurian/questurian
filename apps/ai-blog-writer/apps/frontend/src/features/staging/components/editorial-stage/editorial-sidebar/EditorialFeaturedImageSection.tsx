import type { MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import { getMediaAssetAltText } from '../../../features/editorial-stage-article/media-utils'

type EditorialFeaturedImageSectionProps = {
  stagedArticle: StagedArticle
  requirementLabel: string
  selectedImage: MediaAsset | null
  isEditingLocked: boolean
  getImageUrl: (asset: MediaAsset) => string
  onOpenModal: () => void
}

export function EditorialFeaturedImageSection({
  stagedArticle,
  requirementLabel,
  selectedImage,
  isEditingLocked,
  getImageUrl,
  onOpenModal,
}: EditorialFeaturedImageSectionProps) {
  return (
    <div className="stage-article-sidebar-section">
      <label className="stage-article-label">
        Featured Image <span className="required">*</span>
      </label>
      <span className="stage-article-label-hint">Required: {requirementLabel}</span>

      {selectedImage ? (
        <div className="stage-article-featured-image">
          <img
            src={getImageUrl(selectedImage)}
            alt={getMediaAssetAltText(selectedImage) || selectedImage.filename}
          />
          {!isEditingLocked && (
            <button type="button" onClick={onOpenModal} className="stage-article-change-btn">
              Change
            </button>
          )}
        </div>
      ) : stagedArticle.featuredImageId ? (
        <div className="stage-article-featured-image-pending">
          <p>
            Featured image selected (ID {stagedArticle.featuredImageId}). Preview will load shortly.
          </p>
          {!isEditingLocked && (
            <button
              type="button"
              onClick={onOpenModal}
              className="stage-article-change-btn-inline"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenModal}
          className="stage-article-image-placeholder"
          disabled={isEditingLocked}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Select image</span>
        </button>
      )}
    </div>
  )
}
