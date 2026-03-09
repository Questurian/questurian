import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ImageUpload,
  MultiVariantCropper,
  uploadImageVariants,
  type ImageVariantType,
  type UploadImageResponse,
  type UploadProgress,
} from '../../images'
import {
  fetchExternalImageSource,
  searchPexelsImages,
  searchUnsplashImages,
} from '../../staging/api/external-images/external-images.api'
import type {
  ExternalImageProvider,
  PexelsOrientation,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../staging/api/external-images/external-images.types'
import {
  buildExternalAltText,
  buildExternalImportRef,
  buildExternalPhotographerCredit,
  buildImageFileNamePrefix,
  getPexelsPhotoImportUrl,
  getUnsplashPhotoImportUrl,
} from '../../staging/features/editorial-stage-article/media-utils'
import { fetchMediaSetLibrary } from '../api'
import type { MediaSetOption, RelationshipFieldDefinition } from '../types'
import { formatMediaSetLabel, resolveMediaSetPreviewUrl } from '../utils'
import '../../../components/FeaturedImagePicker/FeaturedImagePicker.css'

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

type CoverImagePickerFieldProps = {
  field: RelationshipFieldDefinition
  value: number | null
  token: string | null
  locationRef: number | null
  mediaSets: MediaSetOption[]
  onValueChange: (value: number | null) => void
}

function buildUploadExternalRef(locationRef: number | null): string {
  return `location-cover-upload-${locationRef ?? 'draft'}-${Date.now()}`
}

function parseMediaSetId(result: UploadImageResponse): number {
  const mediaSetId = Number(result.mediaSetId)
  if (!Number.isFinite(mediaSetId)) {
    throw new Error('Uploaded image is missing a valid media set id.')
  }
  return mediaSetId
}

function resolveExternalSourceUrl(
  provider: ExternalImageProvider,
  photo: UnsplashPhoto | PexelsPhoto,
): string {
  return provider === 'unsplash'
    ? getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
    : getPexelsPhotoImportUrl(photo as PexelsPhoto)
}

function CoverImagePickerModal({
  isOpen,
  selectedId,
  token,
  locationRef,
  onSelect,
  onClose,
}: {
  isOpen: boolean
  selectedId: number | null
  token: string
  locationRef: number | null
  onSelect: (mediaSetId: number) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('payload')
  const [payloadMediaSets, setPayloadMediaSets] = useState<MediaSetOption[]>([])
  const [isLoadingPayload, setIsLoadingPayload] = useState(false)
  const [isBootstrappingPayload, setIsBootstrappingPayload] = useState(false)
  const [payloadSearch, setPayloadSearch] = useState('')
  const [payloadError, setPayloadError] = useState<string | null>(null)
  const [uploadAltText, setUploadAltText] = useState('')
  const [uploadPhotographerCredit, setUploadPhotographerCredit] = useState('')
  const [uploadExternalRef, setUploadExternalRef] = useState(() => buildUploadExternalRef(locationRef))
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const [unsplashOrientation, setUnsplashOrientation] = useState<PexelsOrientation | ''>('')
  const [unsplashResults, setUnsplashResults] = useState<UnsplashPhoto[]>([])
  const [isSearchingUnsplash, setIsSearchingUnsplash] = useState(false)
  const [unsplashError, setUnsplashError] = useState<string | null>(null)
  const [pexelsQuery, setPexelsQuery] = useState('')
  const [pexelsOrientation, setPexelsOrientation] = useState<PexelsOrientation | ''>('')
  const [pexelsResults, setPexelsResults] = useState<PexelsPhoto[]>([])
  const [isSearchingPexels, setIsSearchingPexels] = useState(false)
  const [pexelsError, setPexelsError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [externalCropDraft, setExternalCropDraft] = useState<ExternalCropDraft | null>(null)
  const [externalUploadProgress, setExternalUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploadingExternalVariants, setIsUploadingExternalVariants] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const loadPayloadMediaSets = async () => {
      setPayloadError(null)
      setIsBootstrappingPayload(true)
      setIsLoadingPayload(true)

      try {
        const docs = await fetchMediaSetLibrary(token)
        if (!cancelled) {
          setPayloadMediaSets(docs)
        }
      } catch (err) {
        if (!cancelled) {
          setPayloadError(err instanceof Error ? err.message : 'Failed to load media sets')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPayload(false)
          setIsBootstrappingPayload(false)
        }
      }
    }

    void loadPayloadMediaSets()

    return () => {
      cancelled = true
    }
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen) return
    setUploadExternalRef(buildUploadExternalRef(locationRef))
  }, [isOpen, locationRef])

  useEffect(() => {
    if (isOpen) return
    setImportingId(null)
    setImportError(null)
    setExternalCropDraft(null)
    setExternalUploadProgress(null)
    setIsUploadingExternalVariants(false)
  }, [isOpen])

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

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  const filteredPayloadMediaSets = payloadSearch.trim()
    ? payloadMediaSets.filter((item) => {
        const query = payloadSearch.trim().toLowerCase()
        return [item.title, item.location, item.alt_text]
          .filter((value): value is string => Boolean(value?.trim()))
          .some((value) => value.toLowerCase().includes(query))
      })
    : payloadMediaSets

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose()
  }

  const resetExternalCropState = () => {
    setImportingId(null)
    setImportError(null)
    setExternalCropDraft(null)
    setExternalUploadProgress(null)
    setIsUploadingExternalVariants(false)
  }

  const handleTabChange = (nextTab: ActiveTab) => {
    if (nextTab !== activeTab) {
      resetExternalCropState()
    }

    if (nextTab === 'upload') {
      setUploadExternalRef(buildUploadExternalRef(locationRef))
    }

    setActiveTab(nextTab)
  }

  const handlePayloadSelect = (mediaSet: MediaSetOption) => {
    onSelect(mediaSet.id)
    onClose()
  }

  const handleUploadComplete = (result: UploadImageResponse) => {
    onSelect(parseMediaSetId(result))
    onClose()
  }

  const prepareExternalCropDraft = async (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider,
  ) => {
    if (locationRef === null) {
      setImportError('Save this location in Payload before importing a new cover image.')
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
    const externalRef = buildExternalImportRef('location-cover-picker', provider, photo.id)
    const fileNamePrefix = buildImageFileNamePrefix('location-cover', externalRef)

    try {
      const externalSource = await fetchExternalImageSource(
        {
          sourceUrl,
          provider,
          photoId: photo.id,
        },
        token,
      )

      const file = new File([externalSource.blob], externalSource.fileName, {
        type: externalSource.contentType || externalSource.blob.type || 'image/jpeg',
      })

      setExternalCropDraft({
        provider,
        photoId: photo.id,
        sourceUrl,
        file,
        externalRef,
        fileNamePrefix,
        altText: buildExternalAltText(photo.alt, 'Location cover image'),
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
      const response = await searchUnsplashImages(unsplashQuery, {
        perPage: 18,
        orientation: unsplashOrientation || undefined,
      })
      setUnsplashResults(response.photos)
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
      const response = await searchPexelsImages(pexelsQuery, {
        perPage: 18,
        orientation: pexelsOrientation || undefined,
      })
      setPexelsResults(response.photos)
    } catch (err) {
      setPexelsError(err instanceof Error ? err.message : 'Pexels search failed')
    } finally {
      setIsSearchingPexels(false)
    }
  }

  const handleUploadExternalCroppedVariants = async (
    variantFiles: Array<{ type: ImageVariantType; file: File }>,
  ) => {
    if (!externalCropDraft) return
    if (locationRef === null) {
      setImportError('Save this location in Payload before importing a new cover image.')
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
        (progress) => setExternalUploadProgress(progress),
      )
      resetExternalCropState()
      onSelect(parseMediaSetId(result))
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

  const shouldHoldPayloadTab = activeTab === 'payload' && isBootstrappingPayload && payloadMediaSets.length === 0

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
              current ? { ...current, altText: nextAltText } : current,
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
              current ? { ...current, photographerCredit: nextCredit } : current,
            )
          }}
          placeholder={`Example: Photographer / ${providerLabel}`}
          disabled={isUploadingExternalVariants}
        />

        {importError ? <p className="fip-error">{importError}</p> : null}
        {externalUploadProgress ? (
          <p className="fip-external-crop__progress">
            {externalUploadProgress.message} ({externalUploadProgress.progress}%)
          </p>
        ) : null}

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

  return createPortal(
    <div className="fip-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div
        className="fip-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select cover image"
        onClick={(event) => event.stopPropagation()}
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
            title={locationRef === null ? 'Save this location in Payload to enable uploads' : undefined}
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
              <p className="fip-empty">Loading media library...</p>
            </div>
          ) : null}

          {activeTab === 'payload' && !shouldHoldPayloadTab ? (
            <>
              <div className="fip-search-row">
                <input
                  type="text"
                  className="fip-search-input"
                  placeholder="Search by title, location, or alt text..."
                  value={payloadSearch}
                  onChange={(event) => setPayloadSearch(event.target.value)}
                />
              </div>

              {payloadError ? <p className="fip-error">{payloadError}</p> : null}

              {isLoadingPayload ? (
                <p className="fip-empty">Loading media sets...</p>
              ) : (
                <div className="fip-grid">
                  {filteredPayloadMediaSets.length === 0 ? (
                    <p className="fip-empty">
                      {payloadSearch ? 'No media sets match your search.' : 'No media sets found.'}
                    </p>
                  ) : (
                    filteredPayloadMediaSets.map((mediaSet) => {
                      const previewUrl = resolveMediaSetPreviewUrl(mediaSet)
                      const label = formatMediaSetLabel(mediaSet)
                      return (
                        <button
                          key={mediaSet.id}
                          type="button"
                          className={`fip-card${selectedId === mediaSet.id ? ' fip-card--selected' : ''}`}
                          onClick={() => handlePayloadSelect(mediaSet)}
                        >
                          {previewUrl ? (
                            <img
                              className="fip-card__thumb"
                              src={previewUrl}
                              alt={mediaSet.alt_text || label}
                              loading="lazy"
                            />
                          ) : (
                            <div className="fip-card__thumb fip-card__thumb--empty">No preview</div>
                          )}
                          <div className="fip-card__info">
                            <span className="fip-card__name">{label}</span>
                          </div>
                          {selectedId === mediaSet.id ? (
                            <div className="fip-card__badge" aria-label="Selected">
                              ✓
                            </div>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </>
          ) : null}

          {activeTab === 'upload' ? (
            <div className="fip-upload-pane">
              {locationRef === null ? (
                <p className="fip-location-notice">
                  Save this location in Payload before you upload a new cover image.
                </p>
              ) : (
                <ImageUpload
                  className="fip-upload-flow"
                  externalRef={uploadExternalRef}
                  fileNamePrefix="location-cover"
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
          ) : null}

          {activeTab === 'unsplash' ? (
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
                      onChange={(event) => setUnsplashQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleUnsplashSearch()
                        }
                      }}
                    />
                    <select
                      className="fip-search-select"
                      value={unsplashOrientation}
                      onChange={(event) => setUnsplashOrientation(event.target.value as PexelsOrientation | '')}
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

                  {unsplashError ? <p className="fip-error">{unsplashError}</p> : null}
                  {importError ? <p className="fip-error">{importError}</p> : null}
                  {locationRef === null ? (
                    <p className="fip-location-notice">
                      Search works here, but you need to save this location in Payload before importing a new cover image.
                    </p>
                  ) : null}

                  {unsplashResults.length > 0 ? (
                    <>
                      <p className="fip-masonry-header">
                        Click an image to open the crop editor before importing it into Payload.
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
                              disabled={importingId !== null || isUploadingExternalVariants}
                              title={
                                locationRef === null
                                  ? 'Save this location in Payload before importing'
                                  : photo.photographer ?? 'Open crop editor for Unsplash image'
                              }
                            >
                              <img
                                className="fip-card__thumb fip-card__thumb--natural"
                                src={getUnsplashPhotoImportUrl(photo)}
                                alt={photo.alt ?? 'Unsplash photo'}
                                loading="lazy"
                                width={photo.width}
                                height={photo.height}
                              />
                              {isImporting ? (
                                <div className="fip-card__spinner">
                                  <span className="fip-spinner" />
                                </div>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  ) : (!isSearchingUnsplash && !unsplashError) ? (
                    <p className="fip-empty">Enter a query and click Search to find Unsplash photos.</p>
                  ) : null}
                </>
              )
          ) : null}

          {activeTab === 'pexels' ? (
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
                      onChange={(event) => setPexelsQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handlePexelsSearch()
                        }
                      }}
                    />
                    <select
                      className="fip-search-select"
                      value={pexelsOrientation}
                      onChange={(event) => setPexelsOrientation(event.target.value as PexelsOrientation | '')}
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

                  {pexelsError ? <p className="fip-error">{pexelsError}</p> : null}
                  {importError ? <p className="fip-error">{importError}</p> : null}
                  {locationRef === null ? (
                    <p className="fip-location-notice">
                      Search works here, but you need to save this location in Payload before importing a new cover image.
                    </p>
                  ) : null}

                  {pexelsResults.length > 0 ? (
                    <>
                      <p className="fip-masonry-header">
                        Click an image to open the crop editor before importing it into Payload.
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
                              disabled={importingId !== null || isUploadingExternalVariants}
                              title={
                                locationRef === null
                                  ? 'Save this location in Payload before importing'
                                  : photo.photographer ?? 'Open crop editor for Pexels image'
                              }
                            >
                              <img
                                className="fip-card__thumb fip-card__thumb--natural"
                                src={getPexelsPhotoImportUrl(photo)}
                                alt={photo.alt ?? 'Pexels photo'}
                                loading="lazy"
                                width={photo.width}
                                height={photo.height}
                              />
                              {isImporting ? (
                                <div className="fip-card__spinner">
                                  <span className="fip-spinner" />
                                </div>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  ) : (!isSearchingPexels && !pexelsError) ? (
                    <p className="fip-empty">Enter a query and click Search to find Pexels photos.</p>
                  ) : null}
                </>
              )
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function CoverImagePickerField({
  field,
  value,
  token,
  locationRef,
  mediaSets,
  onValueChange,
}: CoverImagePickerFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [selectedMediaSet, setSelectedMediaSet] = useState<MediaSetOption | null>(null)
  const [isLoadingSelected, setIsLoadingSelected] = useState(false)

  const selectedOption = useMemo(
    () => mediaSets.find((mediaSet) => mediaSet.id === value) || null,
    [mediaSets, value],
  )

  useEffect(() => {
    if (!value || !token) {
      setSelectedMediaSet(null)
      setIsLoadingSelected(false)
      return
    }

    let cancelled = false
    setIsLoadingSelected(true)

    const loadSelectedMediaSet = async () => {
      try {
        const docs = await fetchMediaSetLibrary(token, { id: value })
        if (!cancelled) {
          setSelectedMediaSet(docs[0] || null)
        }
      } catch {
        if (!cancelled) {
          setSelectedMediaSet(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelected(false)
        }
      }
    }

    void loadSelectedMediaSet()

    return () => {
      cancelled = true
    }
  }, [token, value])

  const selectedLabel = selectedMediaSet
    ? formatMediaSetLabel(selectedMediaSet)
    : selectedOption
      ? formatMediaSetLabel(selectedOption)
      : value
        ? `Media Set #${value}`
        : 'Select cover image'

  const selectedPreviewUrl = resolveMediaSetPreviewUrl(selectedMediaSet)

  return (
    <div className="ldb-field-control-stack">
      {value ? (
        <div className="ldb-cover-image-preview">
          <button
            type="button"
            className="ldb-cover-image-preview__button"
            onClick={() => setIsPickerOpen(true)}
            disabled={!token}
          >
            {selectedPreviewUrl ? (
              <img
                className="ldb-cover-image-preview__thumb"
                src={selectedPreviewUrl}
                alt={selectedMediaSet?.alt_text || selectedLabel}
              />
            ) : (
              <div className="ldb-cover-image-preview__thumb ldb-cover-image-preview__thumb--empty">
                {isLoadingSelected ? 'Loading...' : 'No preview'}
              </div>
            )}
            <div className="ldb-cover-image-preview__meta">
              <strong>{selectedLabel}</strong>
              <span>{selectedMediaSet?.alt_text || 'Media set selected for this cover image.'}</span>
            </div>
          </button>

          <div className="ldb-cover-image-actions">
            <button type="button" className="ldb-ghost-btn" onClick={() => setIsPickerOpen(true)} disabled={!token}>
              Change Cover Image
            </button>
            <button type="button" className="ldb-danger-link" onClick={() => onValueChange(null)}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ldb-picker-trigger"
          onClick={() => setIsPickerOpen(true)}
          disabled={!token}
        >
          <span className="ldb-picker-trigger__preview">
            <span className="ldb-picker-trigger__label ldb-picker-trigger__label--placeholder">
              {field.label}
            </span>
          </span>
          <span className="ldb-picker-trigger__caret">▼</span>
        </button>
      )}

      {token ? (
        <CoverImagePickerModal
          isOpen={isPickerOpen}
          selectedId={value}
          token={token}
          locationRef={locationRef}
          onSelect={(mediaSetId) => {
            onValueChange(mediaSetId)
            setSelectedMediaSet(null)
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </div>
  )
}
