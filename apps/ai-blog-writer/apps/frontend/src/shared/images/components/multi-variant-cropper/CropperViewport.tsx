import Cropper, { type Area, type Point } from 'react-easy-crop'
import {
  VARIANT_SPECS,
  VARIANT_SEQUENCE,
  type CropStates,
  type ImageVariantType,
} from '../../utils/imageProcessing'
import { formatVariantLabel } from './cropper.utils'

type CropperViewportProps = {
  previewUrl: string
  imageDimensions: { width: number; height: number } | null
  currentVariantIndex: number
  currentVariantType: ImageVariantType
  currentState: CropStates[ImageVariantType]
  onCropChange: (crop: Point) => void
  onZoomChange: (zoom: number) => void
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void
}

export function CropperViewport({
  previewUrl,
  imageDimensions,
  currentVariantIndex,
  currentVariantType,
  currentState,
  onCropChange,
  onZoomChange,
  onCropComplete,
}: CropperViewportProps) {
  const spec = VARIANT_SPECS[currentVariantType]

  return (
    <>
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #27272a',
          flexShrink: 0,
        }}
      >
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#f4f4f5',
            margin: 0,
          }}
        >
          Crop: {formatVariantLabel(currentVariantType)}
        </h3>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#71717a',
            margin: '0.25rem 0 0 0',
          }}
        >
          Step {currentVariantIndex + 1} of {VARIANT_SEQUENCE.length} • Target:{' '}
          {spec.width}×{spec.height}px ({spec.label})
          {imageDimensions &&
            ` • Source: ${imageDimensions.width}×${imageDimensions.height}`}
        </p>
      </div>

      <div className="stage-article-cropper-area" style={{ height: '280px' }}>
        {previewUrl && (
          <Cropper
            image={previewUrl}
            crop={currentState.crop}
            zoom={currentState.zoom}
            aspect={spec.ratio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
            restrictPosition
            cropShape="rect"
            showGrid
            style={{
              containerStyle: { background: '#000', height: '100%' },
              cropAreaStyle: { border: '2px solid #f36f2b' },
            }}
          />
        )}
      </div>
    </>
  )
}
