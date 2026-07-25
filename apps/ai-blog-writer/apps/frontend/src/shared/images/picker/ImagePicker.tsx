import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ImageUpload,
  type ImageVariantType,
  type UploadImageResponse,
} from '..'
import { fetchMediaAssets } from '../../api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import { searchPexelsImages, searchUnsplashImages } from '../external/external-images.api'
import type { PexelsPhoto, UnsplashPhoto } from '../external/external-images.types'
import { getPexelsPhotoImportUrl, getUnsplashPhotoImportUrl } from '../external/external-import.utils'
import type { ImagePickerQuery, ImagePickerResult, ImagePickerSelectionMode } from './imagePicker.types'
import { pickUploadedAssetId } from './mediaSet.utils'
import { useExternalImageImport } from './useExternalImageImport'
import { useImagePickerData } from './useImagePickerData'
import { useProviderImageSearch } from './useProviderImageSearch'
import { useImagePickerSelectionBuffer } from './useImagePickerSelectionBuffer'
import { buildUploadIdentity } from './imagePicker.utils'
import { ImagePickerGrid } from './ImagePickerGrid'
import { ExternalImagePanel, MultiSelectFooter } from './ExternalImagePanel'
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

  const buffer = useImagePickerSelectionBuffer(requiredCount)

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
    buffer.reset()
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
      buffer.addToBuffer(asset.id, asset, 'toggle')
      return
    }
    emitAssets([asset])
    onClose()
  }

  const handleMediaSetClick = (mediaSet: (typeof data.mediaSets)[number]) => {
    if (isMulti) {
      buffer.addMediaSetToBuffer(mediaSet)
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
      const mediaSets = buffer.bufferIds
        .map((id) => buffer.bufferMediaSets.get(id))
        .filter((mediaSet): mediaSet is MediaSet => Boolean(mediaSet))
      if (mediaSets.length !== requiredCount) return
      onSelect({ kind: 'mediaSets', mediaSets })
      onClose()
      return
    }

    const assets = buffer.bufferIds
      .map((id) => buffer.bufferAssets.get(id))
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
      buffer.addToBuffer(assetId, res.docs[0] ?? null, 'rolling')
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
                  bufferIds={isMulti ? buffer.bufferIds : null}
                  onAssetClick={handlePayloadAssetClick}
                  onMediaSetClick={handleMediaSetClick}
                />
              )}

              {isMulti && (
                <MultiSelectFooter
                  selectedCount={buffer.bufferIds.length}
                  requiredCount={requiredCount}
                  confirmLabel={confirmLabel}
                  onConfirm={handleConfirmMulti}
                />
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

          {activeTab === 'unsplash' && (
            <ExternalImagePanel
              provider="unsplash"
              controller={unsplash}
              importUrl={(photo) => getUnsplashPhotoImportUrl(photo as UnsplashPhoto)}
              importer={importer}
              locationRef={locationRef}
              isMulti={isMulti}
              bufferIds={buffer.bufferIds}
              requiredCount={requiredCount}
              confirmLabel={confirmLabel}
              onConfirmMulti={handleConfirmMulti}
              onCropConfirm={(variantFiles) => {
                void handleExternalCropConfirm(variantFiles)
              }}
            />
          )}
          {activeTab === 'pexels' && (
            <ExternalImagePanel
              provider="pexels"
              controller={pexels}
              importUrl={(photo) => getPexelsPhotoImportUrl(photo as PexelsPhoto)}
              importer={importer}
              locationRef={locationRef}
              isMulti={isMulti}
              bufferIds={buffer.bufferIds}
              requiredCount={requiredCount}
              confirmLabel={confirmLabel}
              onConfirmMulti={handleConfirmMulti}
              onCropConfirm={(variantFiles) => {
                void handleExternalCropConfirm(variantFiles)
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
