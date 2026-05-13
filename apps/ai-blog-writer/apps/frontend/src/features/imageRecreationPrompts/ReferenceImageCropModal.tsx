import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import {
  calculateDefaultCrop,
  createCroppedImage,
  loadImage,
} from '../../shared/images'
import type { ImageVariantType } from '../../shared/images'
import {
  REFERENCE_CROP_PRESET_OPTIONS,
  getReferenceCropPreset,
  type ReferenceCropPresetId,
} from './referenceCropPresets'

export type ReferenceCropSelection = {
  presetId: ImageVariantType
  label: string
  width: number
  height: number
  file: File
}

type ReferenceImageCropModalProps = {
  isOpen: boolean
  sourceFile: File | null
  sourcePreviewUrl: string | null
  initialPresetId: ReferenceCropPresetId
  onClose: () => void
  onUseOriginal: () => void
  onConfirm: (selection: ReferenceCropSelection) => void
}

export function ReferenceImageCropModal({
  isOpen,
  sourceFile,
  sourcePreviewUrl,
  initialPresetId,
  onClose,
  onUseOriginal,
  onConfirm,
}: ReferenceImageCropModalProps) {
  const [selectedPresetId, setSelectedPresetId] =
    useState<ReferenceCropPresetId>(initialPresetId)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [sourceDimensions, setSourceDimensions] = useState<{
    width: number
    height: number
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const selectedPreset = getReferenceCropPreset(selectedPresetId)
  const defaultCropPixels = useMemo(() => {
    if (
      !sourceDimensions ||
      selectedPresetId === 'original' ||
      !selectedPreset.ratio
    ) {
      return null
    }

    return calculateDefaultCrop(
      sourceDimensions.width,
      sourceDimensions.height,
      selectedPreset.ratio,
    )
  }, [selectedPreset, selectedPresetId, sourceDimensions])

  useEffect(() => {
    if (!isOpen || !sourcePreviewUrl) return

    let cancelled = false
    setSelectedPresetId(initialPresetId)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setLocalError(null)

    void loadImage(sourcePreviewUrl)
      .then((image) => {
        if (cancelled) return
        setSourceDimensions({
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setLocalError(
          error instanceof Error ? error.message : 'Failed to load image.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [initialPresetId, isOpen, sourcePreviewUrl])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isSaving, onClose])

  useEffect(() => {
    if (!isOpen) return

    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setLocalError(null)

    if (selectedPresetId === 'original') {
      setCroppedAreaPixels(null)
      return
    }

    if (defaultCropPixels) {
      setCroppedAreaPixels(defaultCropPixels)
    }
  }, [defaultCropPixels, isOpen, selectedPresetId])

  if (!isOpen || !sourceFile || !sourcePreviewUrl) {
    return null
  }

  const activeSourceFile = sourceFile
  const activeSourcePreviewUrl = sourcePreviewUrl

  function handleUseOriginal() {
    if (isSaving) return
    onUseOriginal()
  }

  async function handleConfirmCrop() {
    if (selectedPresetId === 'original') {
      return
    }

    if (!selectedPreset.width || !selectedPreset.height) {
      setLocalError('Choose a shared crop preset before saving.')
      return
    }

    const cropPixels = croppedAreaPixels ?? defaultCropPixels
    if (!cropPixels) {
      setLocalError('Adjust the crop before staging the image.')
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      const stagedFileName = `${activeSourceFile.name.replace(
        /\.[^/.]+$/,
        '',
      )}-${selectedPresetId}.png`
      const croppedFile = await createCroppedImage(
        activeSourcePreviewUrl,
        {
          x: Math.round(cropPixels.x),
          y: Math.round(cropPixels.y),
          width: Math.round(cropPixels.width),
          height: Math.round(cropPixels.height),
        },
        {
          width: selectedPreset.width,
          height: selectedPreset.height,
        },
        stagedFileName,
      )

      onConfirm({
        presetId: selectedPresetId,
        label: selectedPreset.summaryLabel,
        width: selectedPreset.width,
        height: selectedPreset.height,
        file: croppedFile,
      })
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Failed to stage the cropped reference image.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="irp-crop-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!isSaving) {
          onClose()
        }
      }}
    >
      <div
        className="irp-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Reference image crop editor"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="irp-crop-modal__header">
          <div>
            <p className="irp-panel-kicker">Reference crop editor</p>
            <h3>Stage the exact image FLUX will receive</h3>
            <p className="irp-crop-modal__lede">
              Use the same shared crop presets as the other AI image tools.
              Save one staged crop and that becomes the actual file sent to
              FLUX.
            </p>
          </div>
          <button
            type="button"
            className="irp-btn irp-btn-ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Close
          </button>
        </div>

        <div className="irp-crop-preset-bar" role="tablist" aria-label="Crop presets">
          {REFERENCE_CROP_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`irp-crop-preset-btn${
                option.id === selectedPresetId ? ' is-active' : ''
              }`}
              aria-pressed={option.id === selectedPresetId}
              onClick={() => setSelectedPresetId(option.id)}
              disabled={isSaving}
            >
              <span className="irp-crop-preset-btn__title">{option.title}</span>
              <span className="irp-crop-preset-btn__meta">
                {option.width && option.height
                  ? `${option.width} × ${option.height}`
                  : 'Keep original dimensions'}
              </span>
            </button>
          ))}
        </div>

        {selectedPresetId === 'original' ? (
          <div className="irp-crop-modal__original-stage">
            <img
              className="irp-crop-modal__original-image"
              src={activeSourcePreviewUrl}
              alt="Original reference preview"
            />
          </div>
        ) : (
          <div className="irp-crop-modal__frame">
            <Cropper
              image={activeSourcePreviewUrl}
              crop={crop}
              zoom={zoom}
              aspect={selectedPreset.ratio ?? 1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              restrictPosition
              showGrid
              style={{
                containerStyle: { background: '#111715' },
                cropAreaStyle: { border: '2px solid #c46b33' },
              }}
            />
          </div>
        )}

        <div className="irp-crop-modal__meta">
          <span className="irp-block-pill">
            {selectedPreset.width && selectedPreset.height
              ? `Target ${selectedPreset.width} × ${selectedPreset.height}`
              : 'Using original upload'}
          </span>
          {sourceDimensions ? (
            <span className="irp-block-pill">
              Source {sourceDimensions.width} × {sourceDimensions.height}
            </span>
          ) : null}
          {selectedPresetId !== 'original' ? (
            <span className="irp-block-pill">Zoom {Math.round(zoom * 100)}%</span>
          ) : null}
        </div>

        {selectedPresetId !== 'original' ? (
          <label className="irp-field" htmlFor="irp-crop-zoom">
            <span className="irp-field-label">Zoom</span>
            <span className="irp-field-helper">
              Drag to reposition the image. Increase zoom if you need a tighter
              crop inside the selected preset.
            </span>
            <input
              id="irp-crop-zoom"
              className="irp-crop-modal__zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={isSaving}
            />
          </label>
        ) : (
          <p className="irp-field-helper">
            Original keeps the untouched upload active. Choose any shared preset
            above if you want to lock the framing and exact dimensions before
            FLUX runs.
          </p>
        )}

        {localError ? (
          <p className="irp-status irp-status--error" role="status">
            {localError}
          </p>
        ) : null}

        <div className="irp-crop-modal__actions">
          <button
            type="button"
            className="irp-btn irp-btn-ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="irp-btn irp-btn-secondary"
            onClick={handleUseOriginal}
            disabled={isSaving}
          >
            Use original
          </button>
          <button
            type="button"
            className="irp-btn irp-btn-primary"
            onClick={handleConfirmCrop}
            disabled={isSaving || selectedPresetId === 'original'}
          >
            {isSaving ? 'Saving crop…' : 'Save crop'}
          </button>
        </div>
      </div>
    </div>
  )
}
