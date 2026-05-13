import { useEffect, useRef, type ReactNode } from 'react'
import Masonry from 'react-masonry-css'
import { ImageUpload, type UploadImageResponse } from '../../../../shared/images'
import type {
  ExternalImageProvider,
  Location,
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../api'
import type { StagedArticle } from '../../types'
import { FEATURED_IMAGE_HEIGHT, FEATURED_IMAGE_VARIANT, FEATURED_IMAGE_WIDTH, EXTERNAL_MASONRY_BREAKPOINTS, UPLOAD_LOCATION_REQUIREMENT_MESSAGE } from '../../features/editorial-stage-article/constants'
import { getMediaAssetAltText, getPexelsPhotoImportUrl, getUnsplashPhotoImportUrl } from '../../features/editorial-stage-article/media-utils'
import type {
  ExternalImageCropDraft,
  ImageSourceOption,
  MediaVariant,
  PexelsOrientationOption,
} from '../../features/editorial-stage-article/types'

type FeaturedImageModalBaseProps = {
  show: boolean
  publishedToPayload: boolean
  onClose: () => void
  featuredImageRequirementLabel: string
}

type FeaturedImageModalPayloadProps = {
  featuredImageSource: ImageSourceOption
  imageSearch: string
  setImageSearch: (value: string) => void
  filteredFeaturedImageAssets: MediaAsset[]
  selectedFeaturedImage: MediaAsset | null
  hasMoreFeaturedPayloadAssets: boolean
  isLoadingFeaturedPayloadAssets: boolean
  featuredPayloadAssetsError: string | null
  loadMoreFeaturedPayloadAssets: () => Promise<void>
}

type FeaturedImageModalUploadProps = {
  featuredImageExternalRef: string
  featuredImageFileNamePrefix: string
  selectedLocation?: Location
  token?: string
  imageAltText: string
  imagePhotographerCredit: string
  setImageAltText: (value: string) => void
  setImagePhotographerCredit: (value: string) => void
  handleUploadComplete: (result: UploadImageResponse) => void
}

type FeaturedImageModalExternalProps = {
  externalImageCropDraft: ExternalImageCropDraft | null
  renderExternalCropEditor: (context: 'featured') => ReactNode
  unsplashFeaturedQuery: string
  setUnsplashFeaturedQuery: (value: string) => void
  unsplashFeaturedOrientation: PexelsOrientationOption
  setUnsplashFeaturedOrientation: (value: PexelsOrientationOption) => void
  unsplashFeaturedPerPage: number
  setUnsplashFeaturedPerPage: (value: number) => void
  runFeaturedUnsplashSearch: () => Promise<void>
  isSearchingUnsplashFeatured: boolean
  unsplashFeaturedError: string | null
  unsplashFeaturedResults: UnsplashPhoto[]
  isImportingFeaturedExternalImage: boolean
  handleImportFeaturedExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider
  ) => Promise<void>
  pexelsFeaturedQuery: string
  setPexelsFeaturedQuery: (value: string) => void
  pexelsFeaturedOrientation: PexelsOrientationOption
  setPexelsFeaturedOrientation: (value: PexelsOrientationOption) => void
  pexelsFeaturedPerPage: number
  setPexelsFeaturedPerPage: (value: number) => void
  runFeaturedPexelsSearch: () => Promise<void>
  isSearchingPexelsFeatured: boolean
  pexelsFeaturedError: string | null
  pexelsFeaturedResults: PexelsPhoto[]
}

type FeaturedImageModalActionsProps = {
  setFeaturedImageSource: (source: ImageSourceOption) => void
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  getImageUrl: (img: MediaAsset) => string
}

type FeaturedImageModalProps = {
  base: FeaturedImageModalBaseProps
  payload: FeaturedImageModalPayloadProps
  upload: FeaturedImageModalUploadProps
  external: FeaturedImageModalExternalProps
  actions: FeaturedImageModalActionsProps
}

export function FeaturedImageModal({
  base,
  payload,
  upload,
  external,
  actions,
}: FeaturedImageModalProps) {
  const { show, publishedToPayload, onClose, featuredImageRequirementLabel } = base
  const {
    featuredImageSource,
    imageSearch,
    setImageSearch,
    filteredFeaturedImageAssets,
    selectedFeaturedImage,
    hasMoreFeaturedPayloadAssets,
    isLoadingFeaturedPayloadAssets,
    featuredPayloadAssetsError,
    loadMoreFeaturedPayloadAssets,
  } = payload
  const {
    featuredImageExternalRef,
    featuredImageFileNamePrefix,
    selectedLocation,
    token,
    imageAltText,
    imagePhotographerCredit,
    setImageAltText,
    setImagePhotographerCredit,
    handleUploadComplete,
  } = upload
  const {
    externalImageCropDraft,
    renderExternalCropEditor,
    unsplashFeaturedQuery,
    setUnsplashFeaturedQuery,
    unsplashFeaturedOrientation,
    setUnsplashFeaturedOrientation,
    unsplashFeaturedPerPage,
    setUnsplashFeaturedPerPage,
    runFeaturedUnsplashSearch,
    isSearchingUnsplashFeatured,
    unsplashFeaturedError,
    unsplashFeaturedResults,
    isImportingFeaturedExternalImage,
    handleImportFeaturedExternalImage,
    pexelsFeaturedQuery,
    setPexelsFeaturedQuery,
    pexelsFeaturedOrientation,
    setPexelsFeaturedOrientation,
    pexelsFeaturedPerPage,
    setPexelsFeaturedPerPage,
    runFeaturedPexelsSearch,
    isSearchingPexelsFeatured,
    pexelsFeaturedError,
    pexelsFeaturedResults,
  } = external
  const {
    setFeaturedImageSource,
    findPreferredVariantAsset,
    updateStagedArticle,
    getImageUrl,
  } = actions
  const modalTitleId = 'featured-image-modal-title'
  const sentinelRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const featuredPayloadStatus = featuredPayloadAssetsError
    ? {
        tone: 'error',
        eyebrow: 'Payload Load Failed',
        message: featuredPayloadAssetsError,
        actionLabel: 'Retry',
      }
    : isLoadingFeaturedPayloadAssets && filteredFeaturedImageAssets.length === 0
      ? {
          tone: 'loading',
          eyebrow: 'Loading',
          message: 'Loading featured images from Payload...',
        }
      : !isLoadingFeaturedPayloadAssets
          && !hasMoreFeaturedPayloadAssets
          && filteredFeaturedImageAssets.length === 0
        ? {
            tone: 'complete',
            eyebrow: 'No Matches',
            message: `No editorial (${FEATURED_IMAGE_WIDTH}x${FEATURED_IMAGE_HEIGHT}) images match the current search.`,
          }
        : isLoadingFeaturedPayloadAssets && filteredFeaturedImageAssets.length > 0
          ? {
              tone: 'loading',
              eyebrow: 'Loading More',
              message: 'Loading more featured images...',
            }
          : !featuredPayloadAssetsError
              && hasMoreFeaturedPayloadAssets
              && !isLoadingFeaturedPayloadAssets
              && filteredFeaturedImageAssets.length > 0
            ? {
                tone: 'neutral',
                eyebrow: 'More Available',
                message: 'More featured Payload images are available.',
                actionLabel: 'Load More Images',
              }
            : !featuredPayloadAssetsError
                && hasMoreFeaturedPayloadAssets
                && !isLoadingFeaturedPayloadAssets
                && filteredFeaturedImageAssets.length === 0
              ? {
                  tone: 'neutral',
                  eyebrow: 'Keep Browsing',
                  message: 'No loaded featured images match yet. Load more to keep searching.',
                  actionLabel: 'Load More Images',
                }
              : !featuredPayloadAssetsError
                  && !hasMoreFeaturedPayloadAssets
                  && !isLoadingFeaturedPayloadAssets
                  && filteredFeaturedImageAssets.length > 0
                ? {
                    tone: 'complete',
                    eyebrow: 'End of Results',
                    message: 'No more featured Payload images are available.',
                  }
                : null

  // IntersectionObserver — load more when sentinel enters the grid's scroll container
  useEffect(() => {
    if (featuredImageSource !== 'payload') return
    if (featuredPayloadAssetsError) return
    if (!hasMoreFeaturedPayloadAssets || isLoadingFeaturedPayloadAssets) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreFeaturedPayloadAssets()
        }
      },
      {
        root: gridRef.current,
        rootMargin: '0px 0px 320px 0px',
        threshold: 0,
      }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [
    featuredImageSource,
    filteredFeaturedImageAssets.length,
    featuredPayloadAssetsError,
    hasMoreFeaturedPayloadAssets,
    isLoadingFeaturedPayloadAssets,
    loadMoreFeaturedPayloadAssets,
  ])

  useEffect(() => {
    if (!show || publishedToPayload) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [show, publishedToPayload, onClose])

  if (!show || publishedToPayload) return null

  return (
    <div className="stage-article-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="stage-article-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stage-article-modal-header">
          <h3 id={modalTitleId}>
            {featuredImageSource === 'upload'
              ? 'Upload Featured Image'
              : featuredImageSource === 'payload'
                ? 'Select Featured Image From Payload'
                : featuredImageSource === 'unsplash'
                  ? 'Search Featured Images on Unsplash'
                  : 'Search Featured Images on Pexels'}
          </h3>
          <button
            type="button"
            className="stage-article-modal-close"
            onClick={onClose}
            aria-label="Close featured image modal"
          >
            ×
          </button>
        </div>

        <div className="stage-article-source-tabs">
          <button
            type="button"
            className={`stage-article-source-tab ${featuredImageSource === 'upload' ? 'active' : ''}`}
            onClick={() => setFeaturedImageSource('upload')}
          >
            Upload
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${featuredImageSource === 'payload' ? 'active' : ''}`}
            onClick={() => setFeaturedImageSource('payload')}
          >
            From Payload
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${featuredImageSource === 'unsplash' ? 'active' : ''}`}
            onClick={() => setFeaturedImageSource('unsplash')}
          >
            From Unsplash
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${featuredImageSource === 'pexels' ? 'active' : ''}`}
            onClick={() => setFeaturedImageSource('pexels')}
          >
            From Pexels
          </button>
        </div>
        <div className="stage-article-modal-context-bar">
          <span className="stage-article-modal-context-chip">Featured</span>
          <div className="stage-article-modal-context-copy">
            <span className="stage-article-modal-context-label">Payload Requirement</span>
            <strong className="stage-article-modal-context-value">
              {featuredImageRequirementLabel}
            </strong>
          </div>
        </div>

        {featuredImageSource === 'payload' && (
          <>
            <div className="stage-article-modal-search">
              <input
                type="text"
                placeholder="Search images..."
                value={imageSearch}
                onChange={(e) => setImageSearch(e.target.value)}
                className="stage-article-modal-search-input"
              />
            </div>

            <div ref={gridRef} className="stage-article-modal-grid">
              {filteredFeaturedImageAssets.map(img => (
                <button
                  key={img.id}
                  type="button"
                  className={`stage-article-modal-image ${selectedFeaturedImage?.id === img.id ? 'selected' : ''}`}
                  onClick={() => {
                    // img is already an editorial-variant asset (from filteredFeaturedImageAssets).
                    // findPreferredVariantAsset is a best-effort lookup; fall back to img itself.
                    const resolvedAsset = findPreferredVariantAsset(img.id, FEATURED_IMAGE_VARIANT) ?? img
                    updateStagedArticle({ featuredImageId: resolvedAsset.id })
                    onClose()
                  }}
                >
                  <img
                    src={getImageUrl(img)}
                    alt={getMediaAssetAltText(img) || img.filename}
                    loading="lazy"
                  />
                  <span className="stage-article-modal-image-name">{img.filename}</span>
                  {selectedFeaturedImage?.id === img.id && (
                    <div className="stage-article-modal-selected-badge">✓</div>
                  )}
                </button>
              ))}
              {hasMoreFeaturedPayloadAssets && (
                <div ref={sentinelRef} style={{ height: '2px', gridColumn: '1 / -1' }} />
              )}
              {featuredPayloadStatus && (
                <div className={`stage-article-modal-status-bar ${featuredPayloadStatus.tone}`}>
                  <div className="stage-article-modal-status-copy">
                    <span className="stage-article-modal-status-eyebrow">
                      {featuredPayloadStatus.eyebrow}
                    </span>
                    <p className="stage-article-modal-status-message">
                      {featuredPayloadStatus.message}
                    </p>
                  </div>
                  {featuredPayloadStatus.actionLabel && (
                    <div className="stage-article-modal-status-actions">
                      <button
                        type="button"
                        className="stage-article-modal-done secondary"
                        onClick={() => void loadMoreFeaturedPayloadAssets()}
                      >
                        {featuredPayloadStatus.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="stage-article-modal-footer">
              <button
                type="button"
                className="stage-article-modal-done secondary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        )}

        {featuredImageSource === 'upload' && (
          <>
            <div className="stage-article-upload-section">
              {selectedLocation ? (
                <ImageUpload
                  externalRef={featuredImageExternalRef}
                  fileNamePrefix={featuredImageFileNamePrefix}
                  locationRef={selectedLocation.id}
                  token={token || ''}
                  altText={imageAltText}
                  photographerCredit={imagePhotographerCredit}
                  onUploadComplete={handleUploadComplete}
                  onAltTextGenerated={(text) => setImageAltText(text)}
                  onPhotographerCreditChange={(text) => setImagePhotographerCredit(text)}
                  onCancel={() => setFeaturedImageSource('payload')}
                />
              ) : (
                <div className="stage-article-modal-empty">
                  <p>{UPLOAD_LOCATION_REQUIREMENT_MESSAGE}</p>
                </div>
              )}
            </div>
          </>
        )}

        {featuredImageSource === 'unsplash' && (
          externalImageCropDraft?.context === 'featured'
            ? renderExternalCropEditor('featured')
            : (
              <>
                <div className="stage-article-modal-search stage-article-modal-search-inline">
                  <input
                    type="text"
                    placeholder="Search with Unsplash..."
                    value={unsplashFeaturedQuery}
                    onChange={(e) => setUnsplashFeaturedQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void runFeaturedUnsplashSearch()
                      }
                    }}
                    className="stage-article-modal-search-input"
                  />
                  <select
                    className="stage-article-modal-search-select"
                    value={unsplashFeaturedOrientation}
                    onChange={(event) => {
                      setUnsplashFeaturedOrientation(event.target.value as PexelsOrientationOption)
                    }}
                  >
                    <option value="">Any orientation</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                    <option value="square">Square</option>
                  </select>
                  <select
                    className="stage-article-modal-search-select"
                    value={String(unsplashFeaturedPerPage)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      setUnsplashFeaturedPerPage(Number.isFinite(parsed) ? parsed : 18)
                    }}
                  >
                    <option value="12">12 results</option>
                    <option value="18">18 results</option>
                    <option value="30">30 results</option>
                  </select>
                  <button
                    type="button"
                    className="stage-article-modal-search-btn"
                    onClick={() => {
                      void runFeaturedUnsplashSearch()
                    }}
                    disabled={isSearchingUnsplashFeatured}
                  >
                    {isSearchingUnsplashFeatured ? 'Searching...' : 'Search with Unsplash'}
                  </button>
                </div>

                {unsplashFeaturedError && (
                  <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                    <p>{unsplashFeaturedError}</p>
                  </div>
                )}

                {unsplashFeaturedResults.length > 0 && (
                  <>
                    <div className="stage-article-modal-pexels-header">
                      Unsplash results. Click an image to crop and import it into Payload.
                    </div>
                    <Masonry
                      breakpointCols={EXTERNAL_MASONRY_BREAKPOINTS}
                      className="stage-article-masonry-grid"
                      columnClassName="stage-article-masonry-column"
                    >
                      {unsplashFeaturedResults.map((photo) => (
                        <button
                          key={`featured-unsplash-${photo.id}`}
                          type="button"
                          title={photo.photographer || 'Import from Unsplash'}
                          className="stage-article-modal-masonry-item stage-article-modal-image-pexels"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => {
                            void handleImportFeaturedExternalImage(photo, 'unsplash')
                          }}
                          disabled={isImportingFeaturedExternalImage}
                        >
                          <img
                            src={getUnsplashPhotoImportUrl(photo)}
                            alt={photo.alt || 'Unsplash image'}
                            loading="lazy"
                            width={photo.width}
                            height={photo.height}
                          />
                        </button>
                      ))}
                    </Masonry>
                    {isImportingFeaturedExternalImage && (
                      <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                        <p>Preparing selected image for crop...</p>
                      </div>
                    )}
                  </>
                )}

                {unsplashFeaturedResults.length === 0 && !unsplashFeaturedError && (
                  <div className="stage-article-modal-empty">
                    <p>Search Unsplash to import an image into Payload.</p>
                  </div>
                )}
              </>
            )
        )}

        {featuredImageSource === 'pexels' && (
          externalImageCropDraft?.context === 'featured'
            ? renderExternalCropEditor('featured')
            : (
              <>
                <div className="stage-article-modal-search stage-article-modal-search-inline">
                  <input
                    type="text"
                    placeholder="Search with Pexels..."
                    value={pexelsFeaturedQuery}
                    onChange={(e) => setPexelsFeaturedQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void runFeaturedPexelsSearch()
                      }
                    }}
                    className="stage-article-modal-search-input"
                  />
                  <select
                    className="stage-article-modal-search-select"
                    value={pexelsFeaturedOrientation}
                    onChange={(event) => {
                      setPexelsFeaturedOrientation(event.target.value as PexelsOrientationOption)
                    }}
                  >
                    <option value="">Any orientation</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                    <option value="square">Square</option>
                  </select>
                  <select
                    className="stage-article-modal-search-select"
                    value={String(pexelsFeaturedPerPage)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      setPexelsFeaturedPerPage(Number.isFinite(parsed) ? parsed : 18)
                    }}
                  >
                    <option value="12">12 results</option>
                    <option value="18">18 results</option>
                    <option value="30">30 results</option>
                    <option value="50">50 results</option>
                  </select>
                  <button
                    type="button"
                    className="stage-article-modal-search-btn"
                    onClick={() => {
                      void runFeaturedPexelsSearch()
                    }}
                    disabled={isSearchingPexelsFeatured}
                  >
                    {isSearchingPexelsFeatured ? 'Searching...' : 'Search with Pexels'}
                  </button>
                </div>

                {pexelsFeaturedError && (
                  <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                    <p>{pexelsFeaturedError}</p>
                  </div>
                )}

                {pexelsFeaturedResults.length > 0 && (
                  <>
                    <div className="stage-article-modal-pexels-header">
                      Pexels results. Click an image to crop and import it into Payload.
                    </div>
                    <Masonry
                      breakpointCols={EXTERNAL_MASONRY_BREAKPOINTS}
                      className="stage-article-masonry-grid"
                      columnClassName="stage-article-masonry-column"
                    >
                      {pexelsFeaturedResults.map((photo) => (
                        <button
                          key={`featured-pexels-${photo.id}`}
                          type="button"
                          title={photo.photographer || 'Import from Pexels'}
                          className="stage-article-modal-masonry-item stage-article-modal-image-pexels"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => {
                            void handleImportFeaturedExternalImage(photo, 'pexels')
                          }}
                          disabled={isImportingFeaturedExternalImage}
                        >
                          <img
                            src={getPexelsPhotoImportUrl(photo)}
                            alt={photo.alt || 'Pexels image'}
                            loading="lazy"
                            width={photo.width}
                            height={photo.height}
                          />
                        </button>
                      ))}
                    </Masonry>
                    {isImportingFeaturedExternalImage && (
                      <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                        <p>Preparing selected image for crop...</p>
                      </div>
                    )}
                  </>
                )}

                {pexelsFeaturedResults.length === 0 && !pexelsFeaturedError && (
                  <div className="stage-article-modal-empty">
                    <p>Search Pexels to import an image into Payload.</p>
                  </div>
                )}
              </>
            )
        )}
      </div>
    </div>
  )
}
