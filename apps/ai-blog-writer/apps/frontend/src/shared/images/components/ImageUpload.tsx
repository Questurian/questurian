import { MultiVariantCropper } from './MultiVariantCropper'
import {
  AltTextField,
  DropZone,
  PhotographerCreditField,
  UploadProgressBar,
} from './upload-primitives'
import { useImageUploadFlow } from '../hooks/useImageUploadFlow'
import type { ImageUploadProps } from '../types'
import './upload-primitives/upload-primitives.css'

export function ImageUpload(props: ImageUploadProps) {
  const {
    stage,
    isDragging,
    selectedFile,
    preview,
    altText,
    photographerCredit,
    isGeneratingAlt,
    progress,
    preparedVariantFiles,
    fileInputRef,
    canContinueToCrop,
    setStage,
    setProgress,
    setAltText,
    setPhotographerCredit,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
    handleClear,
    handleContinueToCrop,
    handleCropConfirm,
    handleRegenerateAltText,
    retryUploadPrepared,
    openFilePicker,
  } = useImageUploadFlow(props)

  const cls = props.className || ''

  if (stage === 'crop' && selectedFile) {
    return (
      <div className={cls}>
        <MultiVariantCropper
          file={selectedFile}
          fileNamePrefix={props.fileNamePrefix}
          onConfirm={handleCropConfirm}
          onCancel={() => setStage('metadata')}
        />
      </div>
    )
  }

  if (stage === 'uploading') {
    return (
      <div className={`stage-article-preview-container ${cls}`} style={{ padding: '1.5rem' }}>
        <UploadProgressBar progress={progress} />
      </div>
    )
  }

  if (progress.status === 'error') {
    return (
      <div className={`stage-article-preview-container ${cls}`} style={{ padding: '1rem' }}>
        <UploadProgressBar
          progress={progress}
          canRetry={Boolean(preparedVariantFiles)}
          canBackToCrop={Boolean(selectedFile)}
          onRetry={retryUploadPrepared}
          onBackToCrop={() => {
            setProgress({ status: 'idle', progress: 0, message: '' })
            setStage('crop')
          }}
          onStartOver={handleClear}
        />
      </div>
    )
  }

  if (stage === 'metadata' && selectedFile) {
    return (
      <div className={`stage-article-image-upload ${cls}`}>
        <div className="stage-article-preview-container">
          <div className="stage-article-preview-image">
            {preview && <img src={preview} alt="Preview" />}
          </div>
          <div className="stage-article-preview-info-compact">
            <span className="stage-article-preview-name-compact">{selectedFile.name}</span>
            <span className="stage-article-preview-size-compact">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <button type="button" className="stage-article-preview-clear-compact" onClick={handleClear}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="stage-article-alttext-section">
            <AltTextField
              value={altText}
              isGenerating={isGeneratingAlt}
              onChange={setAltText}
              onRegenerate={handleRegenerateAltText}
            />
            <div style={{ marginTop: '0.75rem' }}>
              <PhotographerCreditField
                value={photographerCredit}
                showError={!photographerCredit.trim() && !isGeneratingAlt}
                onChange={setPhotographerCredit}
              />
            </div>
          </div>

          <div className="stage-article-upload-actions">
            <button
              type="button"
              className="stage-article-upload-primary"
              onClick={handleContinueToCrop}
              disabled={!canContinueToCrop}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" /><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
              Continue to crop
            </button>
            {props.onCancel && (
              <div className="stage-article-upload-secondary">
                <button type="button" onClick={props.onCancel}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`stage-article-image-upload ${cls}`}>
      <DropZone
        isDragging={isDragging}
        fileInputRef={fileInputRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onInputChange={handleInputChange}
        onOpenPicker={openFilePicker}
      />
    </div>
  )
}
