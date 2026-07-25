import type { StagedArticle } from '../../types'

type StandardArticleFeaturedImagePanelProps = {
  stagedArticle: StagedArticle
  isSynced: boolean
  isStep2Locked: boolean
  featuredImagePreviewUrl?: string
  featuredImageTriggerLabel: string
  onUpdateArticle: (updates: Partial<StagedArticle>) => void
  onContinue: () => void
  onOpenFeaturedImageModal: () => void
}

export function StandardArticleFeaturedImagePanel({
  stagedArticle,
  isSynced,
  isStep2Locked,
  featuredImagePreviewUrl,
  featuredImageTriggerLabel,
  onUpdateArticle,
  onContinue,
  onOpenFeaturedImageModal,
}: StandardArticleFeaturedImagePanelProps) {
  const featuredImageId = stagedArticle.featuredImageId
  const headerPreviewTitle = stagedArticle.title.trim() || 'Your article headline will appear here'

  return (
    <section className="stl-panel sab-stage-panel">
      <div className="stl-panel-header">
        <h2>{!isSynced ? <span className="stl-kicker">Step 2</span> : null} Featured Image</h2>
        {!isSynced ? (
          <div className="stl-inline-actions">
            {isStep2Locked ? (
              stagedArticle.step2_in_update_mode ? (
                <>
                  <button
                    type="button"
                    className="stl-btn stl-btn-secondary"
                    onClick={() => onUpdateArticle({ step2_in_update_mode: false })}
                  >
                    Cancel
                  </button>
                  <button type="button" className="stl-btn" onClick={onContinue}>
                    Save Featured Image
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary"
                  onClick={() => onUpdateArticle({ step2_in_update_mode: true })}
                >
                  Update Featured Image
                </button>
              )
            ) : (
              <button type="button" className="stl-btn" onClick={onContinue}>
                Continue to Step 3
              </button>
            )}
          </div>
        ) : null}
      </div>

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isStep2Locked}>
        <div className="stl-field">
          <span>Featured Image</span>
          {!featuredImageId ? (
            <button
              type="button"
              className="stl-picker-trigger"
              onClick={onOpenFeaturedImageModal}
            >
              <span className="stl-picker-trigger__preview">
                <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                  {featuredImageTriggerLabel}
                </span>
              </span>
              <span className="stl-picker-trigger__caret">▼</span>
            </button>
          ) : (
            <div className="stl-featured-header-preview">
              <button
                type="button"
                className="stl-featured-header-preview__media"
                onClick={onOpenFeaturedImageModal}
              >
                {featuredImagePreviewUrl ? (
                  <img src={featuredImagePreviewUrl} alt="" />
                ) : (
                  <div className="stl-featured-header-preview__fallback">Image selected</div>
                )}
                <div className="stl-featured-header-preview__overlay">
                  <p className="stl-featured-header-preview__title">{headerPreviewTitle}</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </fieldset>
    </section>
  )
}
