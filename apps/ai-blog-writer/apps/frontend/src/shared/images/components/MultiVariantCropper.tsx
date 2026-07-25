import { VARIANT_SEQUENCE, type ImageVariantType } from '../utils/imageProcessing'
import { CropperFooter } from './multi-variant-cropper/CropperFooter'
import { CropperViewport } from './multi-variant-cropper/CropperViewport'
import { VariantProgress } from './multi-variant-cropper/VariantProgress'
import { useMultiVariantCropper } from './multi-variant-cropper/useMultiVariantCropper'

interface MultiVariantCropperProps {
  file: File
  fileNamePrefix?: string
  onConfirm: (variantFiles: { type: ImageVariantType; file: File }[]) => void
  onCancel: () => void
}

export function MultiVariantCropper({
  file,
  fileNamePrefix,
  onConfirm,
  onCancel,
}: MultiVariantCropperProps) {
  const cropper = useMultiVariantCropper({ file, fileNamePrefix, onConfirm })

  const showPrevious = () => {
    if (cropper.currentVariantIndex > 0) {
      cropper.setCurrentVariantIndex(cropper.currentVariantIndex - 1)
    }
  }
  const showNext = () => {
    if (cropper.currentVariantIndex < VARIANT_SEQUENCE.length - 1) {
      cropper.setCurrentVariantIndex(cropper.currentVariantIndex + 1)
    }
  }

  return (
    <div className="stage-article-cropper-container">
      <CropperViewport
        previewUrl={cropper.previewUrl}
        imageDimensions={cropper.imageDimensions}
        currentVariantIndex={cropper.currentVariantIndex}
        currentVariantType={cropper.currentVariantType}
        currentState={cropper.currentState}
        onCropChange={cropper.onCropChange}
        onZoomChange={cropper.onZoomChange}
        onCropComplete={cropper.onCropComplete}
      />

      <div
        className="stage-article-cropper-controls"
        style={{ flexShrink: 0 }}
      >
        <VariantProgress
          cropStates={cropper.cropStates}
          currentVariantIndex={cropper.currentVariantIndex}
          isProcessing={cropper.isProcessing}
          onSelect={cropper.setCurrentVariantIndex}
        />

        <div
          style={{
            fontSize: '0.75rem',
            color: '#71717a',
            textAlign: 'center',
            marginBottom: '0.75rem',
          }}
        >
          Zoom: {Math.round(cropper.currentState.zoom * 100)}% • Scroll or pinch
          to zoom • Drag to move
        </div>

        {cropper.errorMsg && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#f36f2b',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            {cropper.errorMsg}
          </div>
        )}

        <CropperFooter
          currentVariantIndex={cropper.currentVariantIndex}
          isProcessing={cropper.isProcessing}
          currentCropReady={Boolean(cropper.currentState.draftAreaPixels)}
          currentCropSaved={cropper.currentCropSaved}
          allCropsSaved={cropper.allCropsSaved}
          completedCount={cropper.completedCount}
          onPrevious={showPrevious}
          onNext={showNext}
          onSaveAndNext={cropper.saveAndNext}
          onCancel={onCancel}
          onConfirm={() => void cropper.confirmAll()}
        />
      </div>
    </div>
  )
}
