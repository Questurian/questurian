import { MultiVariantCropper, type ImageVariantType } from '..'
import type { useExternalImageImport, ExternalImagePhoto } from './useExternalImageImport'
import type { useProviderImageSearch } from './useProviderImageSearch'

type Importer = ReturnType<typeof useExternalImageImport>
type Provider = 'unsplash' | 'pexels'

const providerLabels: Record<Provider, string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
}

/** Shared multi-select footer; rendered under both the Payload grid and provider results. */
export function MultiSelectFooter({
  selectedCount,
  requiredCount,
  confirmLabel,
  onConfirm,
}: {
  selectedCount: number
  requiredCount: number
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <div className="ip-footer">
      <span className="ip-footer__count">
        Selected {selectedCount}/{requiredCount}
      </span>
      <button
        type="button"
        className="ip-btn ip-btn--primary"
        onClick={onConfirm}
        disabled={selectedCount !== requiredCount}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

function ExternalCropEditor({
  importer,
  onCropConfirm,
}: {
  importer: Importer
  onCropConfirm: (variantFiles: Array<{ type: ImageVariantType; file: File }>) => void
}) {
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
        onConfirm={onCropConfirm}
        onCancel={importer.cancel}
      />
    </div>
  )
}

export type ExternalImagePanelProps<TPhoto extends ExternalImagePhoto> = {
  provider: Provider
  controller: ReturnType<typeof useProviderImageSearch<TPhoto>>
  importUrl: (photo: ExternalImagePhoto) => string
  importer: Importer
  locationRef: number | null
  isMulti: boolean
  bufferIds: number[]
  requiredCount: number
  confirmLabel: string
  onConfirmMulti: () => void
  onCropConfirm: (variantFiles: Array<{ type: ImageVariantType; file: File }>) => void
}

export function ExternalImagePanel<TPhoto extends ExternalImagePhoto>({
  provider,
  controller,
  importUrl,
  importer,
  locationRef,
  isMulti,
  bufferIds,
  requiredCount,
  confirmLabel,
  onConfirmMulti,
  onCropConfirm,
}: ExternalImagePanelProps<TPhoto>) {
  if (importer.cropDraft?.provider === provider) {
    return <ExternalCropEditor importer={importer} onCropConfirm={onCropConfirm} />
  }

  return (
    <>
      <div className="ip-search-row">
        <input
          type="text"
          className="ip-search-input"
          placeholder={`Search ${providerLabels[provider]}...`}
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
            <MultiSelectFooter
              selectedCount={bufferIds.length}
              requiredCount={requiredCount}
              confirmLabel={confirmLabel}
              onConfirm={onConfirmMulti}
            />
          )}
        </>
      ) : (
        !controller.isSearching &&
        !controller.error && <p className="ip-empty">Enter a query and click Search.</p>
      )}
    </>
  )
}
