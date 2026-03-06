import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MouseEvent } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { createCroppedImage } from '../../../images'
import {
  OG_SOCIAL_IMAGE_HEIGHT,
  OG_SOCIAL_IMAGE_WIDTH,
  validateOgSocialImageFile,
} from '../services/seo-social-image-upload.service'

type OgImageCropUploadModalProps = {
  isOpen: boolean
  isUploading: boolean
  onUploadCroppedFile: (file: File) => Promise<void>
  onClose: () => void
}

export function OgImageCropUploadModal({
  isOpen,
  isUploading,
  onUploadCroppedFile,
  onClose,
}: OgImageCropUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingCrop, setIsProcessingCrop] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const isBusy = isUploading || isProcessingCrop

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    if (isOpen) return

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl('')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsDragging(false)
    setIsProcessingCrop(false)
    setLocalError(null)
  }, [isOpen, previewUrl])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBusy) return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isBusy, isOpen, onClose])

  if (!isOpen) return null

  const setFileForCropping = (file: File) => {
    const issue = validateOgSocialImageFile(file)
    if (issue) {
      setLocalError(issue)
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextPreviewUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(nextPreviewUrl)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setLocalError(null)
  }

  const handleClose = () => {
    if (isBusy) return
    onClose()
  }

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== overlayRef.current) return
    handleClose()
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileForCropping(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    setFileForCropping(file)
  }

  const handleUploadCropped = async () => {
    if (!selectedFile || !previewUrl || !croppedAreaPixels) {
      setLocalError('Select an image and adjust the crop before uploading.')
      return
    }

    setLocalError(null)
    setIsProcessingCrop(true)

    try {
      const croppedFile = await createCroppedImage(
        previewUrl,
        {
          x: Math.round(croppedAreaPixels.x),
          y: Math.round(croppedAreaPixels.y),
          width: Math.round(croppedAreaPixels.width),
          height: Math.round(croppedAreaPixels.height),
        },
        { width: OG_SOCIAL_IMAGE_WIDTH, height: OG_SOCIAL_IMAGE_HEIGHT },
        selectedFile.name,
      )

      await onUploadCroppedFile(croppedFile)
      onClose()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to crop and upload OG image.')
    } finally {
      setIsProcessingCrop(false)
    }
  }

  return (
    <div ref={overlayRef} className="stl-modal-overlay" onClick={handleOverlayClick}>
      <div className="stl-modal stl-og-upload-modal" role="dialog" aria-modal="true">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="stl-hidden-file-input"
          onChange={handleInputChange}
          disabled={isBusy}
        />

        <div className="stl-og-upload-modal__header">
          <div>
            <h3>Upload OG Thumb-Stopper</h3>
            <p>Choose any JPG/PNG/WebP up to 10MB, then crop to 1200x630.</p>
          </div>
          <button
            type="button"
            className="stl-btn stl-btn-secondary stl-btn-xs"
            onClick={handleClose}
            disabled={isBusy}
          >
            Close
          </button>
        </div>

        {!selectedFile ? (
          <div
            className={`stl-og-upload-modal__drop-zone${isDragging ? ' is-dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragging(false)
            }}
          >
            <p>Drag and drop image here, or</p>
            <button
              type="button"
              className="stl-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
            >
              Select Image
            </button>
          </div>
        ) : (
          <>
            <div className="stl-og-upload-modal__crop-wrap">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={OG_SOCIAL_IMAGE_WIDTH / OG_SOCIAL_IMAGE_HEIGHT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                restrictPosition
                showGrid
                style={{
                  containerStyle: { background: '#0f172a' },
                  cropAreaStyle: { border: '2px solid #f36f2b' },
                }}
              />
            </div>

            <div className="stl-og-upload-modal__controls">
              <label className="stl-field">
                <span>Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  disabled={isBusy}
                />
              </label>
              <p className="stl-legacy-note">
                Output is fixed to {OG_SOCIAL_IMAGE_WIDTH}x{OG_SOCIAL_IMAGE_HEIGHT}.
              </p>
            </div>
          </>
        )}

        {localError ? <p className="stl-error">{localError}</p> : null}

        <div className="stl-og-upload-modal__actions">
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={handleClose}
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            Choose Different Image
          </button>
          <button
            type="button"
            className="stl-btn"
            onClick={() => void handleUploadCropped()}
            disabled={!selectedFile || isBusy}
          >
            {isBusy ? 'Uploading...' : 'Crop & Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
