import { VARIANT_SEQUENCE } from '../../utils/imageProcessing'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
} from './CropperIcons'

type CropperFooterProps = {
  currentVariantIndex: number
  isProcessing: boolean
  currentCropReady: boolean
  currentCropSaved: boolean
  allCropsSaved: boolean
  completedCount: number
  onPrevious: () => void
  onNext: () => void
  onSaveAndNext: () => void
  onCancel: () => void
  onConfirm: () => void
}

export function CropperFooter({
  currentVariantIndex,
  isProcessing,
  currentCropReady,
  currentCropSaved,
  allCropsSaved,
  completedCount,
  onPrevious,
  onNext,
  onSaveAndNext,
  onCancel,
  onConfirm,
}: CropperFooterProps) {
  const isFirst = currentVariantIndex === 0
  const isLast = currentVariantIndex === VARIANT_SEQUENCE.length - 1

  return (
    <div className="stage-article-cropper-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirst || isProcessing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            background: '#3f3f46',
            color: '#d4d4d8',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            cursor: isFirst || isProcessing ? 'not-allowed' : 'pointer',
            opacity: isFirst || isProcessing ? 0.5 : 1,
          }}
        >
          <ChevronLeftIcon />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={isLast || isProcessing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.5rem 0.75rem',
            background: '#3f3f46',
            color: '#d4d4d8',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            cursor: isLast || isProcessing ? 'not-allowed' : 'pointer',
            opacity: isLast || isProcessing ? 0.5 : 1,
          }}
        >
          Next
          <ChevronRightIcon />
        </button>
      </div>

      <button
        type="button"
        onClick={onSaveAndNext}
        disabled={isProcessing || !currentCropReady}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: currentCropSaved ? '#2f6f48' : '#f36f2b',
          color: '#fff',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor:
            isProcessing || !currentCropReady ? 'not-allowed' : 'pointer',
          opacity: isProcessing || !currentCropReady ? 0.5 : 1,
        }}
      >
        <CheckIcon />
        {isLast ? 'Save crop' : 'Save & Next'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          style={{
            padding: '0.5rem 1rem',
            background: '#3f3f46',
            color: '#d4d4d8',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={isProcessing || !allCropsSaved}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: allCropsSaved ? '#f36f2b' : '#3f3f46',
            color: allCropsSaved ? '#fff' : '#71717a',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor:
              isProcessing || !allCropsSaved ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          {isProcessing ? (
            <>
              <LoaderIcon />
              Processing...
            </>
          ) : (
            <>
              <CheckIcon />
              {allCropsSaved
                ? 'Generate crops'
                : `Saved ${completedCount}/${VARIANT_SEQUENCE.length}`}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
