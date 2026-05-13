import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import Masonry from 'react-masonry-css'
import { ImageUpload, type UploadImageResponse } from '../../../../shared/images'
import type {
  ExternalImageProvider,
  Location,
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../api'
import {
  CONTENT_BLOCK_HEIGHT,
  CONTENT_BLOCK_VARIANT,
  CONTENT_BLOCK_WIDTH,
  EXTERNAL_MASONRY_BREAKPOINTS,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_PAIR_REQUIRED_IMAGE_COUNT,
  IMG_TRIO_REQUIRED_IMAGE_COUNT,
  UPLOAD_LOCATION_REQUIREMENT_MESSAGE,
} from '../../features/editorial-stage-article/constants'
import { getMediaAssetAltText, getPexelsPhotoImportUrl, getUnsplashPhotoImportUrl } from '../../features/editorial-stage-article/media-utils'
import type {
  BlockImageModalState,
  ExternalImageCropDraft,
  ImageSourceOption,
  ImgTrioFormat,
  MediaVariant,
  PexelsOrientationOption,
} from '../../features/editorial-stage-article/types'

type PublishResult = { success: boolean; message: string } | null

type BlockImageModalBaseProps = {
  show: boolean
  publishedToPayload: boolean
  onClose: () => void
  blockImageModal: BlockImageModalState | null
  isImgBlockModal: boolean
  isImgTrioModal: boolean
  isMultiImageModal: boolean
  singleImageRequirementLabel: string
  imgPairRequirementLabel: string
  imgTrioRequirementLabel: string
  activeBlockImageRequirementLabel: string
}

type BlockImageModalPayloadProps = {
  blockImageSource: ImageSourceOption
  imgTrioFormat: ImgTrioFormat
  setImgTrioFormat: Dispatch<SetStateAction<ImgTrioFormat>>
  imgBlockCaption: string
  setImgBlockCaption: Dispatch<SetStateAction<string>>
  blockImageSearch: string
  setBlockImageSearch: Dispatch<SetStateAction<string>>
  isLoadingImgBlockAssets: boolean
  imgBlockAssetsError: string | null
  hasMoreImgBlockAssets: boolean
  loadMoreImgBlockAssets: () => Promise<void>
  filteredBlockImageAssets: MediaAsset[]
  selectedImgBlockAssetIds: number[]
  toggleImgBlockAssetSelection: (assetId: number, requiredCount: number) => void
  requiredImageCount: number
  selectedImgBlockAssetsCount: number
  handleAddSelectedImgBlock: () => void
  imgTrioDimensions: { width: number; height: number }
}

type BlockImageModalUploadProps = {
  selectedLocation?: Location
  blockImageExternalRef: string
  blockImageFileNamePrefix?: string
  token?: string
  blockImageAltText: string
  blockImagePhotographerCredit: string
  setBlockImageAltText: Dispatch<SetStateAction<string>>
  setBlockImagePhotographerCredit: Dispatch<SetStateAction<string>>
  handleBlockImageUploadComplete: (result: UploadImageResponse) => void
}

type BlockImageModalExternalProps = {
  externalImageCropDraft: ExternalImageCropDraft | null
  renderExternalCropEditor: (context: 'block') => ReactNode
  unsplashBlockQuery: string
  setUnsplashBlockQuery: Dispatch<SetStateAction<string>>
  unsplashBlockOrientation: PexelsOrientationOption
  setUnsplashBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashBlockPerPage: number
  setUnsplashBlockPerPage: Dispatch<SetStateAction<number>>
  runBlockUnsplashSearch: () => Promise<void>
  isSearchingUnsplashBlock: boolean
  unsplashBlockError: string | null
  unsplashBlockResults: UnsplashPhoto[]
  isImportingBlockExternalImage: boolean
  handleImportBlockExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider
  ) => Promise<void>
  pexelsBlockQuery: string
  setPexelsBlockQuery: Dispatch<SetStateAction<string>>
  pexelsBlockOrientation: PexelsOrientationOption
  setPexelsBlockOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsBlockPerPage: number
  setPexelsBlockPerPage: Dispatch<SetStateAction<number>>
  runBlockPexelsSearch: () => Promise<void>
  isSearchingPexelsBlock: boolean
  pexelsBlockError: string | null
  pexelsBlockResults: PexelsPhoto[]
  isUploadingExternalImageVariants: boolean
}

type BlockImageModalActionsProps = {
  setBlockImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  addImageAfterBlock: (
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting?: boolean
  ) => string | null
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  getImageTimelineItemId: (blockId: string) => string
  mergeMediaAssetsIntoState: (newAssets: MediaAsset[]) => void
  getImageUrl: (img: MediaAsset) => string
}

type BlockImageModalProps = {
  base: BlockImageModalBaseProps
  payload: BlockImageModalPayloadProps
  upload: BlockImageModalUploadProps
  external: BlockImageModalExternalProps
  actions: BlockImageModalActionsProps
}

export function BlockImageModal({
  base,
  payload,
  upload,
  external,
  actions,
}: BlockImageModalProps) {
  const {
    show,
    publishedToPayload,
    onClose,
    blockImageModal,
    isImgBlockModal,
    isImgTrioModal,
    isMultiImageModal,
    singleImageRequirementLabel,
    imgPairRequirementLabel,
    imgTrioRequirementLabel,
    activeBlockImageRequirementLabel,
  } = base
  const {
    blockImageSource,
    imgTrioFormat,
    setImgTrioFormat,
    imgBlockCaption,
    setImgBlockCaption,
    blockImageSearch,
    setBlockImageSearch,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    hasMoreImgBlockAssets,
    loadMoreImgBlockAssets,
    filteredBlockImageAssets,
    selectedImgBlockAssetIds,
    toggleImgBlockAssetSelection,
    requiredImageCount,
    selectedImgBlockAssetsCount,
    handleAddSelectedImgBlock,
    imgTrioDimensions,
  } = payload
  const {
    selectedLocation,
    blockImageExternalRef,
    blockImageFileNamePrefix,
    token,
    blockImageAltText,
    blockImagePhotographerCredit,
    setBlockImageAltText,
    setBlockImagePhotographerCredit,
    handleBlockImageUploadComplete,
  } = upload
  const {
    externalImageCropDraft,
    renderExternalCropEditor,
    unsplashBlockQuery,
    setUnsplashBlockQuery,
    unsplashBlockOrientation,
    setUnsplashBlockOrientation,
    unsplashBlockPerPage,
    setUnsplashBlockPerPage,
    runBlockUnsplashSearch,
    isSearchingUnsplashBlock,
    unsplashBlockError,
    unsplashBlockResults,
    isImportingBlockExternalImage,
    handleImportBlockExternalImage,
    pexelsBlockQuery,
    setPexelsBlockQuery,
    pexelsBlockOrientation,
    setPexelsBlockOrientation,
    pexelsBlockPerPage,
    setPexelsBlockPerPage,
    runBlockPexelsSearch,
    isSearchingPexelsBlock,
    pexelsBlockError,
    pexelsBlockResults,
    isUploadingExternalImageVariants,
  } = external
  const {
    setBlockImageSource,
    findPreferredVariantAsset,
    addImageAfterBlock,
    setPublishResult,
    setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    mergeMediaAssetsIntoState,
    getImageUrl,
  } = actions
  const modalTitleId = 'block-image-modal-title'
  const sentinelRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const blockRequirementSummary = isImgBlockModal
    ? `Select exactly ${IMG_PAIR_REQUIRED_IMAGE_COUNT} images. ${imgPairRequirementLabel}`
    : isImgTrioModal
      ? `Select exactly ${IMG_TRIO_REQUIRED_IMAGE_COUNT} images. ${imgTrioRequirementLabel}`
      : singleImageRequirementLabel

  useEffect(() => {
    if (!show || publishedToPayload || !blockImageModal) return
    if (blockImageSource !== 'payload') return
    if (imgBlockAssetsError) return
    if (!hasMoreImgBlockAssets || isLoadingImgBlockAssets) return

    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreImgBlockAssets()
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
    blockImageModal,
    blockImageSource,
    hasMoreImgBlockAssets,
    imgBlockAssetsError,
    isLoadingImgBlockAssets,
    loadMoreImgBlockAssets,
    publishedToPayload,
    show,
  ])

  useEffect(() => {
    if (!show || publishedToPayload || !blockImageModal) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [show, publishedToPayload, blockImageModal, onClose])

  if (!show || publishedToPayload || !blockImageModal) return null

  const noBlockImageResultsMessage = isImgBlockModal
    ? `No ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} images match the current search.`
    : isImgTrioModal
      ? `No ${imgTrioDimensions.width}x${imgTrioDimensions.height} images match the current search.`
      : `No ${CONTENT_BLOCK_VARIANT} (${CONTENT_BLOCK_WIDTH}x${CONTENT_BLOCK_HEIGHT}) images match the current search.`
  const blockPayloadStatus = imgBlockAssetsError
    ? {
        tone: 'error',
        eyebrow: 'Payload Load Failed',
        message: imgBlockAssetsError,
        actionLabel: 'Retry',
      }
    : isLoadingImgBlockAssets && filteredBlockImageAssets.length === 0
      ? {
          tone: 'loading',
          eyebrow: 'Loading',
          message: 'Loading images from Payload...',
        }
      : !isLoadingImgBlockAssets
          && !imgBlockAssetsError
          && filteredBlockImageAssets.length === 0
          && !hasMoreImgBlockAssets
        ? {
            tone: 'complete',
            eyebrow: 'No Matches',
            message: noBlockImageResultsMessage,
          }
        : !imgBlockAssetsError
            && hasMoreImgBlockAssets
            && !isLoadingImgBlockAssets
            && filteredBlockImageAssets.length === 0
          ? {
              tone: 'neutral',
              eyebrow: 'Keep Browsing',
              message: 'No loaded Payload images match yet. Load more to keep searching.',
              actionLabel: 'Load More Images',
            }
          : isLoadingImgBlockAssets && filteredBlockImageAssets.length > 0
            ? {
                tone: 'loading',
                eyebrow: 'Loading More',
                message: 'Loading more Payload images...',
              }
            : !imgBlockAssetsError
                && !isLoadingImgBlockAssets
                && hasMoreImgBlockAssets
                && filteredBlockImageAssets.length > 0
              ? {
                  tone: 'neutral',
                  eyebrow: 'More Available',
                  message: 'More Payload images are available.',
                  actionLabel: 'Load More Images',
                }
              : !imgBlockAssetsError
                  && !isLoadingImgBlockAssets
                  && !hasMoreImgBlockAssets
                  && filteredBlockImageAssets.length > 0
                ? {
                    tone: 'complete',
                    eyebrow: 'End of Results',
                    message: 'No more Payload images are available for this picker.',
                  }
                : null

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
            {blockImageSource === 'upload'
              ? isImgBlockModal
                ? 'Upload Is Unavailable for Img Pair'
                : isImgTrioModal
                  ? 'Upload Is Unavailable for Img Trio'
                  : 'Upload New Image'
              : blockImageSource === 'payload'
                ? isImgBlockModal
                  ? 'Add Img Pair Between Blocks'
                  : isImgTrioModal
                    ? 'Add Img Trio Between Blocks'
                    : 'Add Image Between Blocks'
                : blockImageSource === 'unsplash'
                  ? 'Search Images on Unsplash'
                  : 'Search Images on Pexels'}
          </h3>
          <button
            type="button"
            className="stage-article-modal-close"
            onClick={onClose}
            aria-label="Close block image modal"
          >
            ×
          </button>
        </div>

        <div className="stage-article-source-tabs">
          <button
            type="button"
            className={`stage-article-source-tab ${blockImageSource === 'upload' ? 'active' : ''}`}
            onClick={() => {
              if (isMultiImageModal) return
              setBlockImageSource('upload')
            }}
            disabled={isMultiImageModal}
            title={
              isMultiImageModal
                ? 'Upload is currently available for single image blocks only.'
                : 'Upload a new image'
            }
          >
            Upload
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${blockImageSource === 'payload' ? 'active' : ''}`}
            onClick={() => setBlockImageSource('payload')}
          >
            From Payload
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${blockImageSource === 'unsplash' ? 'active' : ''}`}
            onClick={() => setBlockImageSource('unsplash')}
          >
            From Unsplash
          </button>
          <button
            type="button"
            className={`stage-article-source-tab ${blockImageSource === 'pexels' ? 'active' : ''}`}
            onClick={() => setBlockImageSource('pexels')}
          >
            From Pexels
          </button>
        </div>

        {blockImageSource === 'payload' && (
          <>
            <div className="stage-article-modal-context-bar">
              <span className="stage-article-modal-context-chip">
                {isImgBlockModal ? 'Img Pair' : isImgTrioModal ? 'Img Trio' : 'Single Image'}
              </span>
              <div className="stage-article-modal-context-copy">
                <span className="stage-article-modal-context-label">Payload Requirement</span>
                <strong className="stage-article-modal-context-value">
                  {blockRequirementSummary}
                </strong>
              </div>
            </div>

            {isImgTrioModal && (
              <div className="stage-article-modal-search" style={{ marginBottom: '0.5rem' }}>
                <select
                  className="stage-article-select"
                  value={imgTrioFormat}
                  onChange={(e) => setImgTrioFormat(e.target.value as ImgTrioFormat)}
                >
                  <option value="square">Square | square | 1080x1080 | 1:1</option>
                  <option value="landscape">Landscape | wide | 1920x1080 | 16:9</option>
                </select>
              </div>
            )}

            {isMultiImageModal && (
              <div className="stage-article-modal-search" style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder={isImgTrioModal ? 'Caption for all three images (optional)' : 'Caption for both images (optional)'}
                  value={imgBlockCaption}
                  onChange={(e) => setImgBlockCaption(e.target.value)}
                  className="stage-article-modal-search-input"
                />
              </div>
            )}

            <div className="stage-article-modal-search">
              <input
                type="text"
                placeholder="Search images..."
                value={blockImageSearch}
                onChange={(e) => setBlockImageSearch(e.target.value)}
                className="stage-article-modal-search-input"
              />
            </div>

            <div ref={gridRef} className="stage-article-modal-grid">
              {filteredBlockImageAssets
                .map(img => (
                  <button
                    key={img.id}
                    type="button"
                    className={`stage-article-modal-image ${isMultiImageModal && selectedImgBlockAssetIds.includes(img.id) ? 'selected' : ''}`}
                    onClick={() => {
                      if (isMultiImageModal) {
                        toggleImgBlockAssetSelection(img.id, requiredImageCount)
                        return
                      }

                      const preferredAsset = findPreferredVariantAsset(img.id, CONTENT_BLOCK_VARIANT)
                      if (!preferredAsset) return
                      const addedBlockId = addImageAfterBlock(
                        blockImageModal.blockId,
                        preferredAsset.id,
                        getMediaAssetAltText(preferredAsset),
                        blockImageModal.replaceExistingBlock === true
                      )
                      if (!addedBlockId) {
                        setPublishResult({
                          success: false,
                          message: 'Could not add the image block. Try selecting the target position again.',
                        })
                        return
                      }

                      setActiveEditingTimelineItemId(getImageTimelineItemId(addedBlockId))
                      mergeMediaAssetsIntoState([preferredAsset])
                      onClose()
                    }}
                  >
                    <img
                      src={getImageUrl(img)}
                      alt={getMediaAssetAltText(img) || img.filename}
                      loading="lazy"
                    />
                    <span className="stage-article-modal-image-name">{img.filename}</span>
                    {isMultiImageModal && selectedImgBlockAssetIds.includes(img.id) && (
                      <div className="stage-article-modal-selected-badge">
                        {selectedImgBlockAssetIds.indexOf(img.id) + 1}
                      </div>
                    )}
                  </button>
                ))}
              {hasMoreImgBlockAssets && (
                <div ref={sentinelRef} style={{ height: '2px', gridColumn: '1 / -1' }} />
              )}
              {blockPayloadStatus && (
                <div className={`stage-article-modal-status-bar ${blockPayloadStatus.tone}`}>
                  <div className="stage-article-modal-status-copy">
                    <span className="stage-article-modal-status-eyebrow">
                      {blockPayloadStatus.eyebrow}
                    </span>
                    <p className="stage-article-modal-status-message">
                      {blockPayloadStatus.message}
                    </p>
                  </div>
                  {blockPayloadStatus.actionLabel && (
                    <div className="stage-article-modal-status-actions">
                      <button
                        type="button"
                        className="stage-article-modal-done secondary"
                        onClick={() => void loadMoreImgBlockAssets()}
                      >
                        {blockPayloadStatus.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="stage-article-modal-footer">
              {isMultiImageModal && (
                <button
                  type="button"
                  className="stage-article-modal-done"
                  onClick={handleAddSelectedImgBlock}
                  disabled={selectedImgBlockAssetsCount !== requiredImageCount}
                >
                  {isImgTrioModal ? 'Add Img Trio' : 'Add Img Pair'}
                </button>
              )}
              <button
                type="button"
                className="stage-article-modal-done secondary"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {blockImageSource === 'upload' && (
          <>
            {isMultiImageModal ? (
              <div className="stage-article-modal-empty">
                <p>Upload currently supports single image blocks only. Use Payload images for Img Pair and Img Trio blocks.</p>
                <button
                  type="button"
                  className="stage-article-modal-done"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => setBlockImageSource('payload')}
                >
                  Switch to Payload
                </button>
              </div>
            ) : (
              <div className="stage-article-upload-section">
                {selectedLocation ? (
                  <ImageUpload
                    externalRef={blockImageExternalRef}
                    fileNamePrefix={blockImageFileNamePrefix}
                    locationRef={selectedLocation.id}
                    token={token || ''}
                    altText={blockImageAltText}
                    photographerCredit={blockImagePhotographerCredit}
                    onUploadComplete={handleBlockImageUploadComplete}
                    onAltTextGenerated={(text) => setBlockImageAltText(text)}
                    onPhotographerCreditChange={(text) => setBlockImagePhotographerCredit(text)}
                    onCancel={() => setBlockImageSource('payload')}
                  />
                ) : (
                  <div className="stage-article-modal-empty">
                    <p>{UPLOAD_LOCATION_REQUIREMENT_MESSAGE}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {blockImageSource === 'unsplash' && (
          externalImageCropDraft?.context === 'block'
            ? renderExternalCropEditor('block')
            : (
              <>
                <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
                  Target for this block: {activeBlockImageRequirementLabel}
                </p>
                <div className="stage-article-modal-search stage-article-modal-search-inline">
                  <input
                    type="text"
                    placeholder="Search with Unsplash..."
                    value={unsplashBlockQuery}
                    onChange={(e) => setUnsplashBlockQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void runBlockUnsplashSearch()
                      }
                    }}
                    className="stage-article-modal-search-input"
                  />
                  <select
                    className="stage-article-modal-search-select"
                    value={unsplashBlockOrientation}
                    onChange={(event) => {
                      setUnsplashBlockOrientation(event.target.value as PexelsOrientationOption)
                    }}
                  >
                    <option value="">Any orientation</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                    <option value="square">Square</option>
                  </select>
                  <select
                    className="stage-article-modal-search-select"
                    value={String(unsplashBlockPerPage)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      setUnsplashBlockPerPage(Number.isFinite(parsed) ? parsed : 18)
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
                      void runBlockUnsplashSearch()
                    }}
                    disabled={isSearchingUnsplashBlock}
                  >
                    {isSearchingUnsplashBlock ? 'Searching...' : 'Search with Unsplash'}
                  </button>
                </div>

                {unsplashBlockError && (
                  <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                    <p>{unsplashBlockError}</p>
                  </div>
                )}

                {unsplashBlockResults.length > 0 && (
                  <>
                    <div className="stage-article-modal-pexels-header">
                      Unsplash results. Click an image to crop and import it into Payload.
                    </div>
                    <Masonry
                      breakpointCols={EXTERNAL_MASONRY_BREAKPOINTS}
                      className="stage-article-masonry-grid"
                      columnClassName="stage-article-masonry-column"
                    >
                      {unsplashBlockResults.map((photo) => (
                        <button
                          key={`block-unsplash-${photo.id}`}
                          type="button"
                          title={photo.photographer || 'Import from Unsplash'}
                          className="stage-article-modal-masonry-item stage-article-modal-image-pexels"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => {
                            void handleImportBlockExternalImage(photo, 'unsplash')
                          }}
                          disabled={isImportingBlockExternalImage}
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
                    {isMultiImageModal && (
                      <div className="stage-article-modal-footer">
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b6b6b' }}>
                          Selected {selectedImgBlockAssetIds.length}/{requiredImageCount}
                        </p>
                        <button
                          type="button"
                          className="stage-article-modal-done"
                          onClick={handleAddSelectedImgBlock}
                          disabled={
                            selectedImgBlockAssetIds.length !== requiredImageCount
                            || isUploadingExternalImageVariants
                          }
                        >
                          {isImgTrioModal ? 'Add Img Trio' : 'Add Img Pair'}
                        </button>
                      </div>
                    )}
                    {isImportingBlockExternalImage && (
                      <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                        <p>Preparing selected image for crop...</p>
                      </div>
                    )}
                  </>
                )}

                {unsplashBlockResults.length === 0 && !unsplashBlockError && (
                  <div className="stage-article-modal-empty">
                    <p>Search Unsplash to import an image into Payload.</p>
                  </div>
                )}
              </>
            )
        )}

        {blockImageSource === 'pexels' && (
          externalImageCropDraft?.context === 'block'
            ? renderExternalCropEditor('block')
            : (
              <>
                <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
                  Target for this block: {activeBlockImageRequirementLabel}
                </p>
                <div className="stage-article-modal-search stage-article-modal-search-inline">
                  <input
                    type="text"
                    placeholder="Search with Pexels..."
                    value={pexelsBlockQuery}
                    onChange={(e) => setPexelsBlockQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void runBlockPexelsSearch()
                      }
                    }}
                    className="stage-article-modal-search-input"
                  />
                  <select
                    className="stage-article-modal-search-select"
                    value={pexelsBlockOrientation}
                    onChange={(event) => {
                      setPexelsBlockOrientation(event.target.value as PexelsOrientationOption)
                    }}
                  >
                    <option value="">Any orientation</option>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                    <option value="square">Square</option>
                  </select>
                  <select
                    className="stage-article-modal-search-select"
                    value={String(pexelsBlockPerPage)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      setPexelsBlockPerPage(Number.isFinite(parsed) ? parsed : 18)
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
                      void runBlockPexelsSearch()
                    }}
                    disabled={isSearchingPexelsBlock}
                  >
                    {isSearchingPexelsBlock ? 'Searching...' : 'Search with Pexels'}
                  </button>
                </div>

                {pexelsBlockError && (
                  <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                    <p>{pexelsBlockError}</p>
                  </div>
                )}

                {pexelsBlockResults.length > 0 && (
                  <>
                    <div className="stage-article-modal-pexels-header">
                      Pexels results. Click an image to crop and import it into Payload.
                    </div>
                    <Masonry
                      breakpointCols={EXTERNAL_MASONRY_BREAKPOINTS}
                      className="stage-article-masonry-grid"
                      columnClassName="stage-article-masonry-column"
                    >
                      {pexelsBlockResults.map((photo) => (
                        <button
                          key={`block-pexels-${photo.id}`}
                          type="button"
                          title={photo.photographer || 'Import from Pexels'}
                          className="stage-article-modal-masonry-item stage-article-modal-image-pexels"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => {
                            void handleImportBlockExternalImage(photo, 'pexels')
                          }}
                          disabled={isImportingBlockExternalImage}
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
                    {isMultiImageModal && (
                      <div className="stage-article-modal-footer">
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b6b6b' }}>
                          Selected {selectedImgBlockAssetIds.length}/{requiredImageCount}
                        </p>
                        <button
                          type="button"
                          className="stage-article-modal-done"
                          onClick={handleAddSelectedImgBlock}
                          disabled={
                            selectedImgBlockAssetIds.length !== requiredImageCount
                            || isUploadingExternalImageVariants
                          }
                        >
                          {isImgTrioModal ? 'Add Img Trio' : 'Add Img Pair'}
                        </button>
                      </div>
                    )}
                    {isImportingBlockExternalImage && (
                      <div className="stage-article-modal-empty" style={{ paddingTop: '0.75rem' }}>
                        <p>Preparing selected image for crop...</p>
                      </div>
                    )}
                  </>
                )}

                {pexelsBlockResults.length === 0 && !pexelsBlockError && (
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
