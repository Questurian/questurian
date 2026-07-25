import {
  VARIANT_SEQUENCE,
  VARIANT_SPECS,
  type CropStates,
} from '../../utils/imageProcessing'
import { CheckIcon } from './CropperIcons'
import { formatVariantLabel, isVariantCropSaved } from './cropper.utils'

type VariantProgressProps = {
  cropStates: CropStates
  currentVariantIndex: number
  isProcessing: boolean
  onSelect: (index: number) => void
}

export function VariantProgress({
  cropStates,
  currentVariantIndex,
  isProcessing,
  onSelect,
}: VariantProgressProps) {
  return (
    <div className="stage-article-cropper-variants">
      {VARIANT_SEQUENCE.map((type, index) => {
        const isActive = index === currentVariantIndex
        const isCompleted = isVariantCropSaved(cropStates, type)
        return (
          <button
            key={type}
            onClick={() => onSelect(index)}
            disabled={isProcessing}
            className={`stage-article-cropper-variant-btn ${
              isActive ? 'active' : isCompleted ? 'completed' : 'pending'
            }`}
          >
            {isCompleted && <CheckIcon />}
            <span>{formatVariantLabel(type)}</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>
              ({VARIANT_SPECS[type].label})
            </span>
          </button>
        )
      })}
    </div>
  )
}
