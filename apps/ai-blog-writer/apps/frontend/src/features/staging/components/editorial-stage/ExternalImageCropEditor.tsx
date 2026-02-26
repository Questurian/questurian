import type { Dispatch, SetStateAction } from 'react'
import { MultiVariantCropper } from '../../../../features/images/components/MultiVariantCropper'
import type { UploadProgress } from '../../../../features/images/api/imagesApi'
import type { ImageVariantType } from '../../../../features/images/utils/imageProcessing'
import { EXTERNAL_PROVIDER_LABEL } from '../../features/editorial-stage-article/constants'
import type { ExternalImageCropContext, ExternalImageCropDraft } from '../../features/editorial-stage-article/types'

type ExternalImageCropEditorProps = {
  context: ExternalImageCropContext
  externalImageCropDraft: ExternalImageCropDraft | null
  setExternalImageCropDraft: Dispatch<SetStateAction<ExternalImageCropDraft | null>>
  externalImageCropError: string | null
  setExternalImageCropError: Dispatch<SetStateAction<string | null>>
  externalImageUploadProgress: UploadProgress | null
  setExternalImageUploadProgress: Dispatch<SetStateAction<UploadProgress | null>>
  isUploadingExternalImageVariants: boolean
  setIsUploadingExternalImageVariants: Dispatch<SetStateAction<boolean>>
  handleUploadExternalCroppedVariants: (
    variantFiles: Array<{ type: ImageVariantType; file: File }>
  ) => Promise<void>
}

export function ExternalImageCropEditor({
  context,
  externalImageCropDraft,
  setExternalImageCropDraft,
  externalImageCropError,
  setExternalImageCropError,
  externalImageUploadProgress,
  setExternalImageUploadProgress,
  isUploadingExternalImageVariants,
  setIsUploadingExternalImageVariants,
  handleUploadExternalCroppedVariants,
}: ExternalImageCropEditorProps) {
  if (!externalImageCropDraft || externalImageCropDraft.context !== context) {
    return null
  }

  const providerLabel = EXTERNAL_PROVIDER_LABEL[externalImageCropDraft.provider]
  const handleBackToResults = () => {
    setExternalImageCropDraft(null)
    setExternalImageCropError(null)
    setExternalImageUploadProgress(null)
    setIsUploadingExternalImageVariants(false)
  }

  return (
    <div className="stage-article-upload-section">
      <div className="stage-article-preview-container" style={{ marginBottom: '0.75rem' }}>
        <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.82rem', color: '#6b6b6b' }}>
          Cropping {providerLabel} image before upload.
        </p>

        <label className="stage-article-alttext-label">Alt Text</label>
        <input
          type="text"
          className="stage-article-alttext-input"
          value={externalImageCropDraft.altText}
          onChange={(event) => {
            const nextAltText = event.target.value
            setExternalImageCropDraft((current) =>
              current ? { ...current, altText: nextAltText } : current
            )
          }}
          placeholder="Describe the image for accessibility"
          disabled={isUploadingExternalImageVariants}
        />

        <label className="stage-article-alttext-label" style={{ marginTop: '0.75rem' }}>
          Photographer Credit <span className="required">*</span>
        </label>
        <input
          type="text"
          className="stage-article-alttext-input"
          value={externalImageCropDraft.photographerCredit}
          onChange={(event) => {
            const nextCredit = event.target.value
            setExternalImageCropDraft((current) =>
              current ? { ...current, photographerCredit: nextCredit } : current
            )
          }}
          placeholder={`Example: Photographer / ${providerLabel}`}
          disabled={isUploadingExternalImageVariants}
        />

        {externalImageCropError && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#ef4444' }}>
            {externalImageCropError}
          </p>
        )}
        {externalImageUploadProgress && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b6b6b' }}>
            {externalImageUploadProgress.message} ({externalImageUploadProgress.progress}%)
          </p>
        )}

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="stage-article-modal-done"
            onClick={handleBackToResults}
            disabled={isUploadingExternalImageVariants}
          >
            Back to Results
          </button>
        </div>
      </div>

      <MultiVariantCropper
        file={externalImageCropDraft.file}
        fileNamePrefix={externalImageCropDraft.fileNamePrefix}
        onConfirm={(variantFiles) => {
          void handleUploadExternalCroppedVariants(variantFiles)
        }}
        onCancel={handleBackToResults}
      />
    </div>
  )
}
