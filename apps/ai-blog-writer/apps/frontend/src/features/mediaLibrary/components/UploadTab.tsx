import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLocations } from '../../../shared/api/payload/payload.api'
import { MultiVariantCropper } from '../../../shared/images/components/MultiVariantCropper'
import {
  AltTextField,
  DropZone,
  PhotographerCreditField,
  UploadProgressBar,
} from '../../../shared/images/components/upload-primitives'
import { useImageUploadFlow } from '../../../shared/images/hooks/useImageUploadFlow'
import '../../../shared/images/components/upload-primitives/upload-primitives.css'

type Props = { token: string }

function buildExternalRef(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .toLowerCase()
}

export function UploadTab({ token }: Props) {
  const [locationRef, setLocationRef] = useState<number | null>(null)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(token),
    enabled: !!token,
  })
  const locations = locationsData?.docs ?? []

  const externalRef = buildExternalRef(
    typeof window !== 'undefined' ? `ml-upload-${Date.now()}` : 'ml-upload'
  )

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
  } = useImageUploadFlow({
    externalRef,
    locationRef: locationRef ?? 0,
    token,
    onComplete: () => {
      setLocationRef(null)
    },
  })

  const canProceed = canContinueToCrop && locationRef !== null

  if (stage === 'crop' && selectedFile) {
    return (
      <div className="ml-upload">
        <MultiVariantCropper
          file={selectedFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setStage('metadata')}
        />
      </div>
    )
  }

  if (stage === 'uploading') {
    return (
      <div className="ml-upload">
        <div className="ml-upload-progress-wrap">
          <UploadProgressBar progress={progress} />
        </div>
      </div>
    )
  }

  if (progress.status === 'error') {
    return (
      <div className="ml-upload">
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

  if (progress.status === 'success') {
    return (
      <div className="ml-upload">
        <div className="ml-upload-success">
          MediaSet created successfully.{' '}
          <button type="button" className="ml-link-btn" onClick={handleClear}>
            Upload another
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'metadata' && selectedFile) {
    return (
      <div className="ml-upload">
        <div className="ml-upload-form">
          <div className="ml-upload-preview-col">
            {preview && (
              <img className="ml-upload-preview" src={preview} alt="Preview" />
            )}
            <p className="ml-upload-filename">{selectedFile.name}</p>
            <button type="button" className="ml-link-btn" onClick={handleClear}>
              Choose a different file
            </button>
          </div>

          <div className="ml-upload-fields-col">
            <AltTextField
              value={altText}
              isGenerating={isGeneratingAlt}
              onChange={setAltText}
              onRegenerate={handleRegenerateAltText}
            />

            <PhotographerCreditField
              value={photographerCredit}
              showError={!photographerCredit.trim() && !isGeneratingAlt}
              onChange={setPhotographerCredit}
            />

            <label className="ml-field-label">
              Location <span className="ml-required">*</span>
              <select
                className="ml-field-input"
                value={locationRef ?? ''}
                onChange={(e) => setLocationRef(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— select a location —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.neighborhood
                      ? `${l.neighborhood}, ${l.city}`
                      : l.city
                      ? `${l.city}, ${l.country}`
                      : l.country}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="ml-save-btn"
              onClick={handleContinueToCrop}
              disabled={!canProceed}
            >
              Continue to crop
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ml-upload">
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
