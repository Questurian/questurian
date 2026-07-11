import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ImageUpload,
  MultiVariantCropper,
  type ImageVariantType,
  type UploadImageResponse,
} from '..'
import { fetchMediaAssets } from '../../api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import { searchPexelsImages, searchUnsplashImages } from '../external/external-images.api'
import type { PexelsPhoto, UnsplashPhoto } from '../external/external-images.types'
import { getPexelsPhotoImportUrl, getUnsplashPhotoImportUrl, buildImageFileNamePrefix } from '../external/external-import.utils'
import type { ImagePickerQuery, ImagePickerResult, ImagePickerSelectionMode } from './imagePicker.types'
import {
  formatMediaSetLabel,
  getMediaAssetAltText,
  isMediaSetSelected,
  pickUploadedAssetId,
  resolveAssetUrl,
  resolveMediaSetPreviewAssetId,
  resolveMediaSetPreviewUrl,
} from './mediaSet.utils'
import { useExternalImageImport, type ExternalImagePhoto } from './useExternalImageImport'
import { useImagePickerData } from './useImagePickerData'
import { useProviderImageSearch } from './useProviderImageSearch'
import './imagePicker.css'

type ActiveTab = 'payload' | 'upload' | 'unsplash' | 'pexels'

export type ImagePickerProps = {
  isOpen: boolean
  token?: string
  /** Required for uploads/imports; when null those tabs show a notice. */
  locationRef: number | null
  /** Reactive filter that drives the Payload fetch (ADR 0020). */
  query: ImagePickerQuery
  /** Single (default) or exact-N multi-select. */
  selection?: ImagePickerSelectionMode
  /** Currently-persisted id, kept highlighted/hydrated. Single-select only. */
  selectedId?: number | null
  uploadExternalRefBase?: string
  uploadFileNameTitle?: string
  importExternalRefBase?: string
  importFileNameTitle?: string
  importAltContextLabel?: string
  /** Caller-owned controls (caption, trio toggle) rendered above the grid. */
  aboveGrid?: ReactNode
  /** Hide upload/provider tabs; useful when only existing Payload records are valid inputs. */
  payloadOnly?: boolean
  /** Confirm-button label in multi mode, e.g. 'Add Img Trio'. */
  confirmLabel?: string
  onSelect: (result: ImagePickerResult) => void
  onClose: () => void
}


function sanitizeRef(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'image-picker'
  )
}

function buildUploadIdentity(base: string, title: string) {
  const externalRef = `${sanitizeRef(base)}_${Date.now()}`
  return { externalRef, fileNamePrefix: buildImageFileNamePrefix(title, externalRef) }
}

export function ImagePicker({
  isOpen,
  token,
  locationRef,
  query,
  selection = { mode: 'single' },
  selectedId = null,
  uploadExternalRefBase = 'image-picker',
  uploadFileNameTitle = 'image',
  importExternalRefBase,
  importFileNameTitle,
  importAltContextLabel = 'Image',
  aboveGrid,
  payloadOnly = false,
  confirmLabel = 'Add selected',
  onSelect,
  onClose,
}: ImagePickerProps) {
  const isMulti = selection.mode === 'multiple'
  const requiredCount = isMulti ? selection.count : 1
  const uploadAvailable = !isMulti && !payloadOnly

  const [activeTab, setActiveTab] = useState<ActiveTab>('payload')
  const [search, setSearch] = useState('')
  const [uploadIdentity, setUploadIdentity] = useState(() =>
    buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle),
  )

  // Source-agnostic multi-select buffer: ordered ids + a resolution map.
  const [bufferIds, setBufferIds] = useState<number[]>([])
  const [bufferAssets, setBufferAssets] = useState<Map<number, MediaAsset>>(new Map())
  const [bufferMediaSets, setBufferMediaSets] = useState<Map<number, MediaSet>>(new Map())

  const overlayRef = useRef<HTMLDivElement>(null)

  const data = useImagePickerData({ isOpen, token, query, search, selectedId })
  const unsplash = useProviderImageSearch<UnsplashPhoto>(searchUnsplashImages)
  const pexels = useProviderImageSearch<PexelsPhoto>(searchPexelsImages)
  const importer = useExternalImageImport({
    token,
    locationRef,
    externalRefBase: importExternalRefBase ?? uploadExternalRefBase,
    fileNameTitle: importFileNameTitle ?? uploadFileNameTitle,
    altContextLabel: importAltContextLabel,
  })

  // Reset transient UI each time the picker opens/closes.
  useEffect(() => {
    if (!isOpen) return
    setActiveTab('payload')
    setSearch('')
    setBufferIds([])
    setBufferAssets(new Map())
    setBufferMediaSets(new Map())
    setUploadIdentity(buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle))
    unsplash.reset()
    pexels.reset()
    importer.reset()
    // Intentionally only on open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Escape to close + lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onClose])

  const addToBuffer = (id: number, asset: MediaAsset | null, mode: 'toggle' | 'rolling') => {
    setBufferAssets((current) => {
      if (!asset) return current
      const next = new Map(current)
      next.set(id, asset)
      return next
    })
    setBufferIds((current) => {
      if (current.includes(id)) {
        return mode === 'toggle' ? current.filter((value) => value !== id) : current
      }
      if (current.length < requiredCount) return [...current, id]
      // Buffer full: rolling drops the oldest; toggle ignores the extra click.
      return mode === 'rolling' ? [...current.slice(1), id] : current
    })
  }

  const addMediaSetToBuffer = (mediaSet: MediaSet) => {
    setBufferMediaSets((current) => {
      const next = new Map(current)
      next.set(mediaSet.id, mediaSet)
      return next
    })
    setBufferIds((current) => {
      if (current.includes(mediaSet.id)) return current.filter((value) => value !== mediaSet.id)
      if (current.length < requiredCount) return [...current, mediaSet.id]
      return current
    })
  }

  if (!isOpen) return null

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose()
  }

  const switchTab = (next: ActiveTab) => {
    if (payloadOnly && next !== 'payload') return
    if (next !== activeTab) importer.reset()
    if (next === 'upload') setUploadIdentity(buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle))
    setActiveTab(next)
  }

  const emitAssets = (assets: MediaAsset[]) => onSelect({ kind: 'assets', assets })

  const handlePayloadAssetClick = (asset: MediaAsset) => {
    if (isMulti) {
      addToBuffer(asset.id, asset, 'toggle')
      return
    }
    emitAssets([asset])
    onClose()
  }

  const handleMediaSetClick = (mediaSet: (typeof data.mediaSets)[number]) => {
    if (isMulti) {
      addMediaSetToBuffer(mediaSet)
      return
    }
    onSelect({ kind: 'mediaSets', mediaSets: [mediaSet] })
    onClose()
  }

  const handleUploadComplete = (response: UploadImageResponse) => {
    onSelect({ kind: 'upload', response })
    onClose()
  }

  const handleConfirmMulti = () => {
    if (query.browseUnit === 'mediaSets') {
      const mediaSets = bufferIds
        .map((id) => bufferMediaSets.get(id))
        .filter((mediaSet): mediaSet is MediaSet => Boolean(mediaSet))
      if (mediaSets.length !== requiredCount) return
      onSelect({ kind: 'mediaSets', mediaSets })
      onClose()
      return
    }

    const assets = bufferIds
      .map((id) => bufferAssets.get(id))
      .filter((asset): asset is MediaAsset => Boolean(asset))
    if (assets.length !== requiredCount) return
    emitAssets(assets)
    onClose()
  }

  const handleExternalCropConfirm = async (
    variantFiles: Array<{ type: ImageVariantType; file: File }>,
  ) => {
    const response = await importer.confirmUpload(variantFiles)
    if (!response) return
    if (!isMulti) {
      onSelect({ kind: 'upload', response })
      onClose()
      return
    }
    // Multi: resolve the imported asset and push it into the shared buffer.
    const assetId = pickUploadedAssetId(response, query.variant ?? undefined)
    if (assetId === null || !token) return
    try {
      const res = await fetchMediaAssets(token, { limit: 1, id: assetId })
      addToBuffer(assetId, res.docs[0] ?? null, 'rolling')
    } catch {
      // Import succeeded but resolution failed; the asset is still in Payload.
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

  const renderExternalCropEditor = () => {
    const draft = importer.cropDraft
    if (!draft) return null
    const providerLabel = draft.provider === 'unsplash' ? 'Unsplash' : 'Pexels'
    return (
      <div className="ip-external-crop">
        <p className="ip-masonry-header">Cropping selected {providerLabel} image before upload.</p>
        <label className="ip-external-crop__label">Alt Text</label>
        <input
          type="text"
          className="ip-external-crop__input"
          value={draft.altText}
          onChange={(event) => importer.updateDraft({ altText: event.target.value })}
          placeholder="Describe the image for accessibility"
          disabled={importer.isUploading}
        />
        <label className="ip-external-crop__label">
          Photographer Credit <span className="ip-required">*</span>
        </label>
        <input
          type="text"
          className="ip-external-crop__input"
          value={draft.photographerCredit}
          onChange={(event) => importer.updateDraft({ photographerCredit: event.target.value })}
          placeholder={`Example: Photographer / ${providerLabel}`}
          disabled={importer.isUploading}
        />
        {importer.error && <p className="ip-error">{importer.error}</p>}
        {importer.uploadProgress && (
          <p className="ip-external-crop__progress">
            {importer.uploadProgress.message} ({importer.uploadProgress.progress}%)
          </p>
        )}
        <div className="ip-external-crop__actions">
          <button type="button" className="ip-btn" onClick={importer.cancel} disabled={importer.isUploading}>
            Back to Results
          </button>
        </div>
        <MultiVariantCropper
          file={draft.file}
          fileNamePrefix={draft.fileNamePrefix}
          onConfirm={(variantFiles) => {
            void handleExternalCropConfirm(variantFiles)
          }}
          onCancel={importer.cancel}
        />
      </div>
    )
  }

  const renderExternalPanel = (
    provider: 'unsplash' | 'pexels',
    controller: typeof unsplash | typeof pexels,
    importUrl: (photo: ExternalImagePhoto) => string,
  ) => {
    if (importer.cropDraft?.provider === provider) return renderExternalCropEditor()
    return (
      <>
        <div className="ip-search-row">
          <input
            type="text"
            className="ip-search-input"
            placeholder={`Search ${provider === 'unsplash' ? 'Unsplash' : 'Pexels'}...`}
            value={controller.query}
            onChange={(event) => controller.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void controller.run()
              }
            }}
          />
          <select
            className="ip-search-select"
            value={controller.orientation}
            onChange={(event) =>
              controller.setOrientation(event.target.value as typeof controller.orientation)
            }
          >
            <option value="">Any orientation</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>
          <button
            type="button"
            className="ip-btn"
            onClick={() => void controller.run()}
            disabled={controller.isSearching || !controller.query.trim()}
          >
            {controller.isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {controller.error && <p className="ip-error">{controller.error}</p>}
        {importer.error && <p className="ip-error">{importer.error}</p>}
        {locationRef === null && controller.results.length > 0 && (
          <p className="ip-notice">Set a location to import images into Payload.</p>
        )}

        {controller.results.length > 0 ? (
          <>
            <p className="ip-masonry-header">
              Click an image to open the crop editor before importing it into Payload.
            </p>
            <div className="ip-masonry">
              {controller.results.map((photo) => {
                const isImporting = importer.importingId === photo.id
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className={`ip-card ip-masonry-item${isImporting ? ' ip-card--importing' : ''}`}
                    onClick={() => void importer.prepareCropDraft(photo as ExternalImagePhoto, provider)}
                    disabled={importer.importingId !== null || locationRef === null || importer.isUploading}
                    title={photo.photographer ?? 'Open crop editor'}
                  >
                    <img
                      className="ip-card__thumb ip-card__thumb--natural"
                      src={importUrl(photo as ExternalImagePhoto)}
                      alt={photo.alt ?? `${provider} photo`}
                      loading="lazy"
                      width={photo.width}
                      height={photo.height}
                    />
                    {isImporting && (
                      <div className="ip-card__spinner">
                        <span className="ip-spinner" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            {isMulti && (
              <div className="ip-footer">
                <span className="ip-footer__count">
                  Selected {bufferIds.length}/{requiredCount}
                </span>
                <button
                  type="button"
                  className="ip-btn ip-btn--primary"
                  onClick={handleConfirmMulti}
                  disabled={bufferIds.length !== requiredCount}
                >
                  {confirmLabel}
                </button>
              </div>
            )}
          </>
        ) : (
          !controller.isSearching &&
          !controller.error && <p className="ip-empty">Enter a query and click Search.</p>
        )}
      </>
    )
  }

  return createPortal(
    <div className="ip-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div
        className="ip-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Image picker"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ip-modal__header">
          <h3>{tabTitle}</h3>
          <button type="button" className="ip-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ip-tabs">
          <button
            type="button"
            className={`ip-tab${activeTab === 'payload' ? ' ip-tab--active' : ''}`}
            onClick={() => switchTab('payload')}
          >
            Payload Library
          </button>
          {!payloadOnly ? (
            <>
              <button
                type="button"
                className={`ip-tab${activeTab === 'upload' ? ' ip-tab--active' : ''}`}
                onClick={() => switchTab('upload')}
                disabled={!uploadAvailable || locationRef === null}
                title={
                  !uploadAvailable
                    ? 'Upload is available for single-image selection only.'
                    : locationRef === null
                      ? 'Set a location to enable uploads.'
                      : undefined
                }
              >
                Upload
              </button>
              <button
                type="button"
                className={`ip-tab${activeTab === 'unsplash' ? ' ip-tab--active' : ''}`}
                onClick={() => switchTab('unsplash')}
              >
                Unsplash
              </button>
              <button
                type="button"
                className={`ip-tab${activeTab === 'pexels' ? ' ip-tab--active' : ''}`}
                onClick={() => switchTab('pexels')}
              >
                Pexels
              </button>
            </>
          ) : null}
        </div>

        {query.requirementLabel && activeTab === 'payload' && (
          <div className="ip-context-bar">
            <span className="ip-context-chip">{query.browseUnit === 'mediaSets' ? 'Media Set' : 'Image'}</span>
            <div className="ip-context-copy">
              <span className="ip-context-label">Requirement</span>
              <strong className="ip-context-value">{query.requirementLabel}</strong>
            </div>
          </div>
        )}

        <div className="ip-body">
          {activeTab === 'payload' && (
            <>
              {aboveGrid && <div className="ip-above-grid">{aboveGrid}</div>}

              <div className="ip-search-row">
                <input
                  type="text"
                  className="ip-search-input"
                  placeholder={
                    query.browseUnit === 'mediaSets'
                      ? 'Search by title, location, or alt text...'
                      : 'Search by filename or alt text...'
                  }
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              {data.error && <p className="ip-error">{data.error}</p>}

              {data.isBootstrapping ? (
                <p className="ip-empty">Loading image library...</p>
              ) : (
                <ImagePickerGrid
                  data={data}
                  browseUnit={query.browseUnit}
                  selectedId={selectedId}
                  bufferIds={isMulti ? bufferIds : null}
                  onAssetClick={handlePayloadAssetClick}
                  onMediaSetClick={handleMediaSetClick}
                />
              )}

              {isMulti && (
                <div className="ip-footer">
                  <span className="ip-footer__count">
                    Selected {bufferIds.length}/{requiredCount}
                  </span>
                  <button
                    type="button"
                    className="ip-btn ip-btn--primary"
                    onClick={handleConfirmMulti}
                    disabled={bufferIds.length !== requiredCount}
                  >
                    {confirmLabel}
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'upload' && (
            <div className="ip-upload-pane">
              {locationRef === null ? (
                <p className="ip-notice">A location must be set before you can upload images.</p>
              ) : (
                <ImageUpload
                  className="ip-upload-flow"
                  externalRef={uploadIdentity.externalRef}
                  fileNamePrefix={uploadIdentity.fileNamePrefix}
                  locationRef={locationRef}
                  token={token ?? ''}
                  onComplete={handleUploadComplete}
                  onCancel={() => switchTab('payload')}
                />
              )}
            </div>
          )}

          {activeTab === 'unsplash' &&
            renderExternalPanel('unsplash', unsplash, (photo) => getUnsplashPhotoImportUrl(photo as UnsplashPhoto))}
          {activeTab === 'pexels' &&
            renderExternalPanel('pexels', pexels, (photo) => getPexelsPhotoImportUrl(photo as PexelsPhoto))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

type ImagePickerGridProps = {
  data: ReturnType<typeof useImagePickerData>
  browseUnit: ImagePickerQuery['browseUnit']
  selectedId: number | null
  bufferIds: number[] | null
  onAssetClick: (asset: MediaAsset) => void
  onMediaSetClick: (mediaSet: ReturnType<typeof useImagePickerData>['mediaSets'][number]) => void
}

function ImagePickerGrid({
  data,
  browseUnit,
  selectedId,
  bufferIds,
  onAssetClick,
  onMediaSetClick,
}: ImagePickerGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data.error || !data.hasMore || data.isLoading) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) data.loadMore()
      },
      { root: gridRef.current, rootMargin: '0px 0px 320px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [data])

  const isEmpty = browseUnit === 'mediaSets' ? data.mediaSets.length === 0 : data.assets.length === 0

  return (
    <div ref={gridRef} className="ip-grid">
      {browseUnit === 'mediaSets'
        ? data.mediaSets.map((mediaSet) => {
            const previewUrl = resolveMediaSetPreviewUrl(mediaSet)
            const previewAssetId = resolveMediaSetPreviewAssetId(mediaSet)
            const label = formatMediaSetLabel(mediaSet)
            const bufferIndex = bufferIds ? bufferIds.indexOf(mediaSet.id) : -1
            const isSelected = bufferIds ? bufferIndex !== -1 : isMediaSetSelected(mediaSet, selectedId)
            return (
              <button
                key={mediaSet.id}
                type="button"
                className={`ip-card${isSelected ? ' ip-card--selected' : ''}`}
                onClick={() => onMediaSetClick(mediaSet)}
                disabled={previewAssetId === null && !previewUrl}
              >
                {previewUrl ? (
                  <img className="ip-card__thumb" src={previewUrl} alt={mediaSet.alt_text ?? label} loading="lazy" />
                ) : (
                  <div className="ip-card__thumb ip-card__thumb--empty">No preview</div>
                )}
                <div className="ip-card__info">
                  <span className="ip-card__name">{label}</span>
                </div>
                {isSelected && <div className="ip-card__badge">{bufferIds ? bufferIndex + 1 : '✓'}</div>}
              </button>
            )
          })
        : data.assets.map((asset) => {
            const bufferIndex = bufferIds ? bufferIds.indexOf(asset.id) : -1
            const isSelected = bufferIds ? bufferIndex !== -1 : selectedId === asset.id
            return (
              <button
                key={asset.id}
                type="button"
                className={`ip-card${isSelected ? ' ip-card--selected' : ''}`}
                onClick={() => onAssetClick(asset)}
              >
                <img
                  className="ip-card__thumb"
                  src={resolveAssetUrl(asset)}
                  alt={getMediaAssetAltText(asset) || asset.filename}
                  loading="lazy"
                />
                <div className="ip-card__info">
                  <span className="ip-card__name">{asset.filename}</span>
                </div>
                {isSelected && <div className="ip-card__badge">{bufferIds ? bufferIndex + 1 : '✓'}</div>}
              </button>
            )
          })}

      {data.hasMore && <div ref={sentinelRef} style={{ height: 2, gridColumn: '1 / -1' }} />}

      {isEmpty && !data.isLoading && <p className="ip-empty">No images found.</p>}
      {data.isLoading && !data.isBootstrapping && <p className="ip-empty">Loading more...</p>}
    </div>
  )
}
