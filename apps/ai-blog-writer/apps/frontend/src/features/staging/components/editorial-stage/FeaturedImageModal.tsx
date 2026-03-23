import { useEffect, useRef, useState, type ReactNode } from 'react'
import Masonry from 'react-masonry-css'
import { ImageUpload, type UploadImageResponse } from '../../../../features/images'
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
  const PAGE_SIZE = 20
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Reset display count when search changes or tab switches to payload
  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
  }, [imageSearch, featuredImageSource])

  // IntersectionObserver — load more when sentinel enters the modal's scroll container
  useEffect(() => {
    if (featuredImageSource !== 'payload') return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayCount((prev) => prev + PAGE_SIZE)
        }
      },
      { root: modalRef.current, threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [featuredImageSource, filteredFeaturedImageAssets.length, displayCount])

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
        ref={modalRef}
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
        <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
          Required featured variant: {featuredImageRequirementLabel}
        </p>

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

            <div className="stage-article-modal-grid">
              {filteredFeaturedImageAssets.slice(0, displayCount).map(img => (
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
            </div>

            {displayCount < filteredFeaturedImageAssets.length && (
              <div ref={sentinelRef} style={{ height: '2px', margin: '0.5rem 0' }} />
            )}

            {filteredFeaturedImageAssets.length === 0 && (
              <div className="stage-article-modal-empty">
                <p>
                  No editorial ({FEATURED_IMAGE_WIDTH}x{FEATURED_IMAGE_HEIGHT}) images
                  match the current search.
                </p>
              </div>
            )}

            <div className="stage-article-modal-footer">
              <button
                type="button"
                className="stage-article-modal-done"
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
