import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ImageUpload,
  MultiVariantCropper,
  uploadImageVariants,
  type ImageVariantType,
  type UploadImageResponse,
  type UploadProgress,
} from '../../features/images'
import { PAYLOAD_API_URL } from '../../features/staging/api/client/config'
import {
  fetchExternalImageSource,
  searchPexelsImages,
  searchUnsplashImages,
} from '../../features/staging/api/external-images/external-images.api'
import type {
  ExternalImageProvider,
  PexelsOrientation,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../features/staging/api/external-images/external-images.types'
import { fetchMediaAssets, fetchMediaSets } from '../../features/staging/api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../features/staging/api/payload/payload.types'
import {
  buildExternalAltText,
  buildExternalImportRef,
  buildExternalPhotographerCredit,
  buildImageFileNamePrefix,
  getPexelsPhotoImportUrl,
  getUnsplashPhotoImportUrl,
  pickVariantAssetId,
} from '../../features/staging/features/editorial-stage-article/media-utils'
import {
  filterAssetsWithMediaSet,
  formatMediaSetLabel,
  getMediaSetId,
  resolveMediaSetPreviewAssetId,
  resolveMediaSetPreviewUrl,
} from './featuredImagePicker.utils'
import './FeaturedImagePicker.css'

type ActiveTab = 'payload' | 'upload' | 'unsplash' | 'pexels'

type ExternalCropDraft = {
  provider: ExternalImageProvider
  photoId: string | number
  sourceUrl: string
  file: File
  externalRef: string
  fileNamePrefix: string
  altText: string
  photographerCredit: string
}

type FeaturedImagePickerProps = {
  isOpen: boolean
  selectedId: number | null
  token: string
  locationRef: number | null
  payloadSourceMode?: 'assets' | 'mediaSets'
  payloadVariant?: MediaAsset['variant']
  requireMediaSet?: boolean
  prefetchedPayloadAssets?: MediaAsset[]
  onSelect: (mediaAssetId: number) => void
  onClose: () => void
}

const PAYLOAD_PAGE_SIZE = 48
const EMPTY_PREFETCHED_PAYLOAD_ASSETS: MediaAsset[] = []

function resolveAssetUrl(asset: MediaAsset): string {
  if (asset.url) return asset.url
  return `${PAYLOAD_API_URL}/api/media-assets/file/${asset.filename}`
}

function resolveExternalSourceUrl(
  provider: ExternalImageProvider,
  photo: UnsplashPhoto | PexelsPhoto
): string {
  return provider === 'unsplash'
    ? getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
    : getPexelsPhotoImportUrl(photo as PexelsPhoto)
}

function appendUniqueAsset(assets: MediaAsset[], asset: MediaAsset | null | undefined): MediaAsset[] {
  if (!asset) return assets
  if (assets.some((entry) => entry.id === asset.id)) return assets
  return [asset, ...assets]
}

function appendUniqueMediaSet(mediaSets: MediaSet[], mediaSet: MediaSet | null | undefined): MediaSet[] {
  if (!mediaSet) return mediaSets
  if (mediaSets.some((entry) => String(entry.id) === String(mediaSet.id))) return mediaSets
  return [mediaSet, ...mediaSets]
}

export function FeaturedImagePicker({
  isOpen,
  selectedId,
  token,
  locationRef,
  payloadSourceMode = 'assets',
  payloadVariant,
  requireMediaSet = true,
  prefetchedPayloadAssets = EMPTY_PREFETCHED_PAYLOAD_ASSETS,
  onSelect,
  onClose,
}: FeaturedImagePickerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('payload')
  const selectedPrefetchedAsset = useMemo(
    () => (
      selectedId === null
        ? null
        : prefetchedPayloadAssets.find((asset) => asset.id === selectedId) ?? null
    ),
    [prefetchedPayloadAssets, selectedId],
  )

  // Payload tab
  const [payloadAssets, setPayloadAssets] = useState<MediaAsset[]>([])
  const [payloadMediaSets, setPayloadMediaSets] = useState<MediaSet[]>([])
  const [isLoadingPayload, setIsLoadingPayload] = useState(false)
  const [isBootstrappingPayload, setIsBootstrappingPayload] = useState(false)
  const [payloadPage, setPayloadPage] = useState(1)
  const [payloadTotalPages, setPayloadTotalPages] = useState(1)
  const [payloadSearch, setPayloadSearch] = useState('')
  const [payloadError, setPayloadError] = useState<string | null>(null)
  const [fetchedSelectedAsset, setFetchedSelectedAsset] = useState<MediaAsset | null>(null)

  // Upload tab
  const [uploadAltText, setUploadAltText] = useState('')
  const [uploadPhotographerCredit, setUploadPhotographerCredit] = useState('')

  // Unsplash tab
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const [unsplashOrientation, setUnsplashOrientation] = useState<PexelsOrientation | ''>('')
  const [unsplashResults, setUnsplashResults] = useState<UnsplashPhoto[]>([])
  const [isSearchingUnsplash, setIsSearchingUnsplash] = useState(false)
  const [unsplashError, setUnsplashError] = useState<string | null>(null)

  // Pexels tab
  const [pexelsQuery, setPexelsQuery] = useState('')
  const [pexelsOrientation, setPexelsOrientation] = useState<PexelsOrientation | ''>('')
  const [pexelsResults, setPexelsResults] = useState<PexelsPhoto[]>([])
  const [isSearchingPexels, setIsSearchingPexels] = useState(false)
  const [pexelsError, setPexelsError] = useState<string | null>(null)

  // Shared external import tracking
  const [importingId, setImportingId] = useState<string | number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [externalCropDraft, setExternalCropDraft] = useState<ExternalCropDraft | null>(null)
  const [externalUploadProgress, setExternalUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploadingExternalVariants, setIsUploadingExternalVariants] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)
  const selectedResolvedAsset = selectedPrefetchedAsset || fetchedSelectedAsset

  useEffect(() => {
    if (!isOpen) {
      setPayloadAssets([])
      setPayloadMediaSets([])
      setPayloadPage(1)
      setPayloadTotalPages(1)
      setPayloadSearch('')
      setPayloadError(null)
      setIsLoadingPayload(false)
      setIsBootstrappingPayload(false)
      return
    }

    setPayloadAssets([])
    setPayloadMediaSets([])
    setPayloadPage(1)
    setPayloadTotalPages(1)
    setPayloadSearch('')
    setPayloadError(null)
  }, [isOpen, payloadSourceMode, payloadVariant])

  useEffect(() => {
    if (!isOpen || selectedId === null || selectedPrefetchedAsset || !token) {
      setFetchedSelectedAsset(null)
      return
    }

    let cancelled = false

    const loadSelectedAsset = async () => {
      try {
        const response = await fetchMediaAssets(token, {
          limit: 1,
          id: selectedId,
        })
        if (cancelled) return
        setFetchedSelectedAsset(response.docs[0] ?? null)
      } catch {
        if (!cancelled) {
          setFetchedSelectedAsset(null)
        }
      }
    }

    void loadSelectedAsset()

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedId, selectedPrefetchedAsset, token])

  const resetExternalCropState = () => {
    setExternalCropDraft(null)
    setExternalUploadProgress(null)
    setImportError(null)
    setIsUploadingExternalVariants(false)
  }

  // Fetch Payload assets when modal opens.
  // Keep the modal shell stable while first payload data loads to avoid jumpy open animation.
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const loadPayloadAssets = async () => {
      setPayloadError(null)
      setIsBootstrappingPayload(payloadPage === 1)
      setIsLoadingPayload(true)

      try {
        if (payloadSourceMode === 'mediaSets') {
          const response = await fetchMediaSets(token, {
            limit: PAYLOAD_PAGE_SIZE,
            page: payloadPage,
          })

          let nextPayloadMediaSets = response.docs
          const selectedMediaSetId = getMediaSetId(selectedResolvedAsset?.mediaSet)

          if (
            selectedMediaSetId !== null
            && !nextPayloadMediaSets.some((mediaSet) => String(mediaSet.id) === String(selectedMediaSetId))
          ) {
            try {
              const selectedMediaSetResponse = await fetchMediaSets(token, {
                limit: 1,
                id: selectedMediaSetId,
              })
              nextPayloadMediaSets = appendUniqueMediaSet(
                nextPayloadMediaSets,
                selectedMediaSetResponse.docs[0] ?? null,
              )
            } catch {
              // Ignore missing selected media-set hydration and keep current page results.
            }
          }

          if (cancelled) return
          setPayloadMediaSets(nextPayloadMediaSets)
          setPayloadAssets([])
          setPayloadTotalPages(Math.max(response.totalPages || 1, 1))
          return
        }

        const response = await fetchMediaAssets(token, {
          limit: PAYLOAD_PAGE_SIZE,
          page: payloadPage,
          mimeType: 'image/',
          variant: payloadVariant,
        })

        let nextPayloadAssets = response.docs

        if (
          selectedId !== null
          && !nextPayloadAssets.some((asset) => asset.id === selectedId)
        ) {
          nextPayloadAssets = appendUniqueAsset(nextPayloadAssets, selectedResolvedAsset)
        }

        if (cancelled) return
        setPayloadAssets(nextPayloadAssets)
        setPayloadMediaSets([])
        setPayloadTotalPages(Math.max(response.totalPages || 1, 1))
      } catch (err) {
        if (cancelled) return
        setPayloadError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        if (!cancelled) {
          setIsLoadingPayload(false)
          setIsBootstrappingPayload(false)
        }
      }
    }

    void loadPayloadAssets()

    return () => {
      cancelled = true
    }
  }, [isOpen, payloadPage, payloadSourceMode, payloadVariant, selectedId, selectedResolvedAsset, token])

  useEffect(() => {
    if (isOpen) return
    setImportingId(null)
    resetExternalCropState()
  }, [isOpen])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const payloadAssetsForSelection = requireMediaSet
    ? filterAssetsWithMediaSet(payloadAssets)
    : payloadAssets
  const searchablePayloadAssets = payloadVariant
    ? payloadAssetsForSelection.filter((asset) => asset.variant === payloadVariant)
    : payloadAssetsForSelection

  const filteredAssets = payloadSearch.trim()
    ? searchablePayloadAssets.filter((a) => {
        const q = payloadSearch.toLowerCase()
        const altText = (a.alt_text ?? a.altText ?? a.alt ?? '').toLowerCase()
        return a.filename.toLowerCase().includes(q) || altText.includes(q)
      })
    : searchablePayloadAssets
  const filteredMediaSets = payloadSearch.trim()
    ? payloadMediaSets.filter((mediaSet) => {
        const q = payloadSearch.toLowerCase()
        return [mediaSet.title, mediaSet.location, mediaSet.alt_text]
          .filter((value): value is string => Boolean(value?.trim()))
          .some((value) => value.toLowerCase().includes(q))
      })
    : payloadMediaSets
  const canGoToPreviousPayloadPage = payloadPage > 1
  const canGoToNextPayloadPage = payloadPage < payloadTotalPages

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose()
  }

  const handleTabChange = (nextTab: ActiveTab) => {
    if (nextTab !== activeTab) {
      setImportingId(null)
      resetExternalCropState()
    }
    setActiveTab(nextTab)
  }

  const handlePayloadSelect = (asset: MediaAsset) => {
    onSelect(asset.id)
    onClose()
  }

  const handleUploadComplete = (result: UploadImageResponse) => {
    const id = pickVariantAssetId(result.variantAssetIds, 'editorial')
    if (id) {
      onSelect(id)
      onClose()
    }
  }

  const prepareExternalCropDraft = async (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider
  ) => {
    if (locationRef === null) {
      setImportError('Set a location in Step 1 to import images into Payload.')
      return
    }

    setImportingId(photo.id)
    setImportError(null)
    setExternalUploadProgress({
      status: 'processing',
      progress: 20,
      message: 'Downloading source image...',
    })

    const sourceUrl = resolveExternalSourceUrl(provider, photo)
    const externalRef = buildExternalImportRef('featured-image-picker', provider, photo.id)
    const fileNamePrefix = buildImageFileNamePrefix('featured-image', externalRef)

    try {
      const externalSource = await fetchExternalImageSource(
        {
          sourceUrl,
          provider,
          photoId: photo.id,
        },
        token
      )

      const file = new File(
        [externalSource.blob],
        externalSource.fileName,
        {
          type: externalSource.contentType || externalSource.blob.type || 'image/jpeg',
        }
      )

      setExternalCropDraft({
        provider,
        photoId: photo.id,
        sourceUrl,
        file,
        externalRef,
        fileNamePrefix,
        altText: buildExternalAltText(photo.alt, 'Featured'),
        photographerCredit: buildExternalPhotographerCredit(photo.photographer, provider),
      })
      setExternalUploadProgress(null)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to download external image')
      setExternalUploadProgress(null)
    } finally {
      setImportingId(null)
    }
  }

  const handleUnsplashSearch = async () => {
    if (!unsplashQuery.trim()) return
    setIsSearchingUnsplash(true)
    setUnsplashError(null)
    setImportError(null)
    try {
      const res = await searchUnsplashImages(unsplashQuery, {
        perPage: 18,
        orientation: unsplashOrientation || undefined,
      })
      setUnsplashResults(res.photos)
    } catch (err) {
      setUnsplashError(err instanceof Error ? err.message : 'Unsplash search failed')
    } finally {
      setIsSearchingUnsplash(false)
    }
  }

  const handlePexelsSearch = async () => {
    if (!pexelsQuery.trim()) return
    setIsSearchingPexels(true)
    setPexelsError(null)
    setImportError(null)
    try {
      const res = await searchPexelsImages(pexelsQuery, {
        perPage: 18,
        orientation: pexelsOrientation || undefined,
      })
      setPexelsResults(res.photos)
    } catch (err) {
      setPexelsError(err instanceof Error ? err.message : 'Pexels search failed')
    } finally {
      setIsSearchingPexels(false)
    }
  }

  const handleUploadExternalCroppedVariants = async (
    variantFiles: Array<{ type: ImageVariantType; file: File }>
  ) => {
    if (!externalCropDraft) return
    if (locationRef === null) {
      setImportError('Set a location in Step 1 to import images into Payload.')
      return
    }

    if (!externalCropDraft.photographerCredit.trim()) {
      setImportError('Photographer credit is required before importing.')
      return
    }

    setIsUploadingExternalVariants(true)
    setImportError(null)

    try {
      const result = await uploadImageVariants(
        variantFiles,
        externalCropDraft.externalRef,
        externalCropDraft.altText,
        locationRef,
        token,
        externalCropDraft.photographerCredit,
        (progress) => setExternalUploadProgress(progress)
      )
      const id = pickVariantAssetId(result.variantAssetIds, 'editorial')
      if (!id) {
        throw new Error('Imported image is missing an editorial (4:3) variant.')
      }

      resetExternalCropState()
      onSelect(id)
      onClose()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to upload external image variants')
      setExternalUploadProgress(null)
    } finally {
      setIsUploadingExternalVariants(false)
    }
  }

  const tabTitle =
    activeTab === 'payload'
      ? 'Select from Payload Library'
      : activeTab === 'upload'
        ? 'Upload Image'
        : activeTab === 'unsplash'
          ? 'Search Unsplash'
          : 'Search Pexels'

  const payloadResultCount = payloadSourceMode === 'mediaSets'
    ? payloadMediaSets.length
    : payloadAssets.length
  const shouldHoldPayloadTab = activeTab === 'payload' && isBootstrappingPayload && payloadResultCount === 0

  const renderExternalCropEditor = () => {
    if (!externalCropDraft) return null

    const providerLabel = externalCropDraft.provider === 'unsplash' ? 'Unsplash' : 'Pexels'

    return (
      <div className="fip-external-crop">
        <p className="fip-masonry-header">
          Cropping selected {providerLabel} image before upload.
        </p>

        <label className="fip-external-crop__label">Alt Text</label>
        <input
          type="text"
          className="fip-external-crop__input"
          value={externalCropDraft.altText}
          onChange={(event) => {
            const nextAltText = event.target.value
            setExternalCropDraft((current) =>
              current ? { ...current, altText: nextAltText } : current
            )
          }}
          placeholder="Describe the image for accessibility"
          disabled={isUploadingExternalVariants}
        />

        <label className="fip-external-crop__label">
          Photographer Credit <span className="required">*</span>
        </label>
        <input
          type="text"
          className="fip-external-crop__input"
          value={externalCropDraft.photographerCredit}
          onChange={(event) => {
            const nextCredit = event.target.value
            setExternalCropDraft((current) =>
              current ? { ...current, photographerCredit: nextCredit } : current
            )
          }}
          placeholder={`Example: Photographer / ${providerLabel}`}
          disabled={isUploadingExternalVariants}
        />

        {importError && <p className="fip-error">{importError}</p>}
        {externalUploadProgress && (
          <p className="fip-external-crop__progress">
            {externalUploadProgress.message} ({externalUploadProgress.progress}%)
          </p>
        )}

        <div className="fip-external-crop__actions">
          <button
            type="button"
            className="fip-search-btn"
            onClick={resetExternalCropState}
            disabled={isUploadingExternalVariants}
          >
            Back to Results
          </button>
        </div>

        <MultiVariantCropper
          file={externalCropDraft.file}
          fileNamePrefix={externalCropDraft.fileNamePrefix}
          onConfirm={(variantFiles) => {
            void handleUploadExternalCroppedVariants(variantFiles)
          }}
          onCancel={resetExternalCropState}
        />
      </div>
    )
  }

  return (
    <div className="fip-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div
        className="fip-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select featured image"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fip-modal__header">
          <h3>{tabTitle}</h3>
          <button type="button" className="fip-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fip-tabs">
          <button
            type="button"
            className={`fip-tab${activeTab === 'payload' ? ' fip-tab--active' : ''}`}
            onClick={() => handleTabChange('payload')}
          >
            Payload Library
          </button>
          <button
            type="button"
            className={`fip-tab${activeTab === 'upload' ? ' fip-tab--active' : ''}`}
            onClick={() => handleTabChange('upload')}
            disabled={locationRef === null}
            title={locationRef === null ? 'Set a location in Step 1 to enable uploads' : undefined}
          >
            Upload
          </button>
          <button
            type="button"
            className={`fip-tab${activeTab === 'unsplash' ? ' fip-tab--active' : ''}`}
            onClick={() => handleTabChange('unsplash')}
          >
            Unsplash
          </button>
          <button
            type="button"
            className={`fip-tab${activeTab === 'pexels' ? ' fip-tab--active' : ''}`}
            onClick={() => handleTabChange('pexels')}
          >
            Pexels
          </button>
        </div>

        <div className="fip-body">
          {shouldHoldPayloadTab ? (
            <div className="fip-loading-shell" aria-live="polite">
              <p className="fip-empty">Loading image library...</p>
            </div>
          ) : null}

          {/* Payload tab */}
          {activeTab === 'payload' && !shouldHoldPayloadTab && (
            <>
              <div className="fip-search-row">
                <input
                  type="text"
                  className="fip-search-input"
                  placeholder={
                    payloadSourceMode === 'mediaSets'
                      ? 'Search current page by title, location, or alt text...'
                      : 'Search current page by filename or alt text...'
                  }
                  value={payloadSearch}
                  onChange={(e) => setPayloadSearch(e.target.value)}
                />
              </div>

              <p className="fip-masonry-header">
                {payloadSourceMode === 'mediaSets'
                  ? `Showing one preview image per media set. Page ${payloadPage} of ${payloadTotalPages}.`
                  : requireMediaSet
                  ? `Only variant-workflow images are shown here. Page ${payloadPage} of ${payloadTotalPages}.`
                  : `Browse Payload images page by page. Page ${payloadPage} of ${payloadTotalPages}.`}
              </p>

              {payloadError && <p className="fip-error">{payloadError}</p>}

              {isLoadingPayload ? (
                <p className="fip-empty">Loading images...</p>
              ) : (
                <>
                  <div className="fip-grid">
                    {payloadSourceMode === 'mediaSets' ? (
                      filteredMediaSets.length === 0 ? (
                        <p className="fip-empty">
                          {payloadSearch
                            ? 'No media sets on this page match your search.'
                            : 'No media sets were found on this page.'}
                        </p>
                      ) : (
                        filteredMediaSets.map((mediaSet) => {
                          const previewAssetId = resolveMediaSetPreviewAssetId(mediaSet)
                          const previewUrl = resolveMediaSetPreviewUrl(mediaSet)
                          const label = formatMediaSetLabel(mediaSet)
                          const isSelected = (
                            previewAssetId === selectedId
                            || (
                              getMediaSetId(selectedResolvedAsset?.mediaSet) !== null
                              && String(getMediaSetId(selectedResolvedAsset?.mediaSet)) === String(mediaSet.id)
                            )
                          )

                          return (
                            <button
                              key={mediaSet.id}
                              type="button"
                              className={`fip-card${isSelected ? ' fip-card--selected' : ''}`}
                              onClick={() => {
                                if (previewAssetId !== null) {
                                  onSelect(previewAssetId)
                                  onClose()
                                }
                              }}
                              disabled={previewAssetId === null}
                            >
                              {previewUrl ? (
                                <img
                                  className="fip-card__thumb"
                                  src={previewUrl}
                                  alt={mediaSet.alt_text ?? label}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="fip-card__thumb fip-card__thumb--empty">No preview</div>
                              )}
                              <div className="fip-card__info">
                                <span className="fip-card__name">{label}</span>
                              </div>
                              {isSelected ? (
                                <div className="fip-card__badge" aria-label="Selected">
                                  ✓
                                </div>
                              ) : null}
                            </button>
                          )
                        })
                      )
                    ) : filteredAssets.length === 0 ? (
                      <p className="fip-empty">
                        {payloadSearch
                          ? 'No images on this page match your search.'
                          : payloadVariant
                            ? `No ${payloadVariant} images uploaded through the variant workflow were found on this page.`
                            : 'No images were found on this page.'}
                      </p>
                    ) : (
                      filteredAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          className={`fip-card${selectedId === asset.id ? ' fip-card--selected' : ''}`}
                          onClick={() => handlePayloadSelect(asset)}
                        >
                          <img
                            className="fip-card__thumb"
                            src={resolveAssetUrl(asset)}
                            alt={asset.alt_text ?? asset.altText ?? asset.alt ?? asset.filename}
                            loading="lazy"
                          />
                          <div className="fip-card__info">
                            <span className="fip-card__name">{asset.filename}</span>
                          </div>
                          {selectedId === asset.id && (
                            <div className="fip-card__badge" aria-label="Selected">
                              ✓
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>

                  {payloadTotalPages > 1 ? (
                    <div className="fip-pagination" aria-label="Payload image pagination">
                      <button
                        type="button"
                        className="fip-search-btn"
                        onClick={() => setPayloadPage((current) => Math.max(1, current - 1))}
                        disabled={!canGoToPreviousPayloadPage || isLoadingPayload}
                      >
                        Previous page
                      </button>
                      <span className="fip-pagination__status">
                        Page {payloadPage} of {payloadTotalPages}
                      </span>
                      <button
                        type="button"
                        className="fip-search-btn"
                        onClick={() => setPayloadPage((current) => Math.min(payloadTotalPages, current + 1))}
                        disabled={!canGoToNextPayloadPage || isLoadingPayload}
                      >
                        Next page
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}

          {/* Upload tab */}
          {activeTab === 'upload' && (
            <div className="fip-upload-pane">
              {locationRef === null ? (
                <p className="fip-location-notice">
                  A location must be set in Step 1 before you can upload images.
                </p>
              ) : (
                <ImageUpload
                  className="fip-upload-flow"
                  externalRef="featured-image-picker"
                  fileNamePrefix="featured"
                  locationRef={locationRef}
                  token={token}
                  altText={uploadAltText}
                  photographerCredit={uploadPhotographerCredit}
                  onUploadComplete={handleUploadComplete}
                  onAltTextGenerated={setUploadAltText}
                  onPhotographerCreditChange={setUploadPhotographerCredit}
                  onCancel={() => handleTabChange('payload')}
                />
              )}
            </div>
          )}

          {/* Unsplash tab */}
          {activeTab === 'unsplash' && (
            externalCropDraft?.provider === 'unsplash'
              ? renderExternalCropEditor()
              : (
                <>
                  <div className="fip-search-row">
                    <input
                      type="text"
                      className="fip-search-input"
                      placeholder="Search Unsplash..."
                      value={unsplashQuery}
                      onChange={(e) => setUnsplashQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleUnsplashSearch()
                        }
                      }}
                    />
                    <select
                      className="fip-search-select"
                      value={unsplashOrientation}
                      onChange={(e) => setUnsplashOrientation(e.target.value as PexelsOrientation | '')}
                    >
                      <option value="">Any orientation</option>
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                      <option value="square">Square</option>
                    </select>
                    <button
                      type="button"
                      className="fip-search-btn"
                      onClick={() => void handleUnsplashSearch()}
                      disabled={isSearchingUnsplash || !unsplashQuery.trim()}
                    >
                      {isSearchingUnsplash ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {unsplashError && <p className="fip-error">{unsplashError}</p>}
                  {importError && activeTab === 'unsplash' && (
                    <p className="fip-error">{importError}</p>
                  )}
                  {locationRef === null && unsplashResults.length > 0 && (
                    <p className="fip-location-notice">
                      Set a location in Step 1 to import images into Payload.
                    </p>
                  )}

                  {unsplashResults.length > 0 ? (
                    <>
                      <p className="fip-masonry-header">
                        Click an image to open crop editor before importing it into Payload.
                      </p>
                      <div className="fip-masonry">
                        {unsplashResults.map((photo) => {
                          const isImporting = importingId === photo.id
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              className={`fip-card fip-masonry-item${isImporting ? ' fip-card--importing' : ''}`}
                              onClick={() => {
                                void prepareExternalCropDraft(photo, 'unsplash')
                              }}
                              disabled={importingId !== null || locationRef === null || isUploadingExternalVariants}
                              title={photo.photographer ?? 'Open crop editor for Unsplash image'}
                            >
                              <img
                                className="fip-card__thumb fip-card__thumb--natural"
                                src={getUnsplashPhotoImportUrl(photo)}
                                alt={photo.alt ?? 'Unsplash photo'}
                                loading="lazy"
                                width={photo.width}
                                height={photo.height}
                              />
                              {isImporting && (
                                <div className="fip-card__spinner">
                                  <span className="fip-spinner" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {importingId !== null && (
                        <p className="fip-masonry-header">Preparing selected image for crop...</p>
                      )}
                    </>
                  ) : (
                    !isSearchingUnsplash &&
                    !unsplashError && (
                      <p className="fip-empty">Enter a query and click Search to find Unsplash photos.</p>
                    )
                  )}
                </>
              )
          )}

          {/* Pexels tab */}
          {activeTab === 'pexels' && (
            externalCropDraft?.provider === 'pexels'
              ? renderExternalCropEditor()
              : (
                <>
                  <div className="fip-search-row">
                    <input
                      type="text"
                      className="fip-search-input"
                      placeholder="Search Pexels..."
                      value={pexelsQuery}
                      onChange={(e) => setPexelsQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handlePexelsSearch()
                        }
                      }}
                    />
                    <select
                      className="fip-search-select"
                      value={pexelsOrientation}
                      onChange={(e) => setPexelsOrientation(e.target.value as PexelsOrientation | '')}
                    >
                      <option value="">Any orientation</option>
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                      <option value="square">Square</option>
                    </select>
                    <button
                      type="button"
                      className="fip-search-btn"
                      onClick={() => void handlePexelsSearch()}
                      disabled={isSearchingPexels || !pexelsQuery.trim()}
                    >
                      {isSearchingPexels ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {pexelsError && <p className="fip-error">{pexelsError}</p>}
                  {importError && activeTab === 'pexels' && <p className="fip-error">{importError}</p>}
                  {locationRef === null && pexelsResults.length > 0 && (
                    <p className="fip-location-notice">
                      Set a location in Step 1 to import images into Payload.
                    </p>
                  )}

                  {pexelsResults.length > 0 ? (
                    <>
                      <p className="fip-masonry-header">
                        Click an image to open crop editor before importing it into Payload.
                      </p>
                      <div className="fip-masonry">
                        {pexelsResults.map((photo) => {
                          const isImporting = importingId === photo.id
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              className={`fip-card fip-masonry-item${isImporting ? ' fip-card--importing' : ''}`}
                              onClick={() => {
                                void prepareExternalCropDraft(photo, 'pexels')
                              }}
                              disabled={importingId !== null || locationRef === null || isUploadingExternalVariants}
                              title={photo.photographer ?? 'Open crop editor for Pexels image'}
                            >
                              <img
                                className="fip-card__thumb fip-card__thumb--natural"
                                src={getPexelsPhotoImportUrl(photo)}
                                alt={photo.alt ?? 'Pexels photo'}
                                loading="lazy"
                                width={photo.width}
                                height={photo.height}
                              />
                              {isImporting && (
                                <div className="fip-card__spinner">
                                  <span className="fip-spinner" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {importingId !== null && (
                        <p className="fip-masonry-header">Preparing selected image for crop...</p>
                      )}
                    </>
                  ) : (
                    !isSearchingPexels &&
                    !pexelsError && (
                      <p className="fip-empty">Enter a query and click Search to find Pexels photos.</p>
                    )
                  )}
                </>
              )
          )}
        </div>
      </div>
    </div>
  )
}
