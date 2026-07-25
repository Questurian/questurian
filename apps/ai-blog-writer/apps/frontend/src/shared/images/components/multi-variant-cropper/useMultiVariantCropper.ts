import { useCallback, useEffect, useState } from 'react'
import type { Area, Point } from 'react-easy-crop'
import {
  VARIANT_SEQUENCE,
  createMultiVariantImages,
  initializeCropStates,
  loadImage,
  type CropStates,
  type ImageVariantType,
} from '../../utils/imageProcessing'
import { formatVariantLabel, isVariantCropSaved } from './cropper.utils'

type UseMultiVariantCropperOptions = {
  file: File
  fileNamePrefix?: string
  onConfirm: (variantFiles: { type: ImageVariantType; file: File }[]) => void
}

export function useMultiVariantCropper({
  file,
  fileNamePrefix,
  onConfirm,
}: UseMultiVariantCropperOptions) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [imageDimensions, setImageDimensions] = useState<{
    width: number
    height: number
  } | null>(null)
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [cropStates, setCropStates] = useState<CropStates>(initializeCropStates())
  const [errorMsg, setErrorMsg] = useState('')
  const currentVariantType = VARIANT_SEQUENCE[currentVariantIndex]
  const currentState = cropStates[currentVariantType]

  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setImageDimensions(null)
    setCropStates(initializeCropStates())
    setCurrentVariantIndex(0)
    setErrorMsg('')

    loadImage(url)
      .then((image) => {
        if (cancelled) return
        const dimensions = {
          width: image.naturalWidth,
          height: image.naturalHeight,
        }
        setImageDimensions(dimensions)
        setCropStates(initializeCropStates(dimensions.width, dimensions.height))
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMsg(error instanceof Error ? error.message : 'Failed to load image')
        }
      })

    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  const onCropChange = useCallback(
    (crop: Point) => {
      setCropStates((previous) => ({
        ...previous,
        [currentVariantType]: {
          ...previous[currentVariantType],
          crop,
          croppedAreaPixels: null,
          completed: false,
        },
      }))
    },
    [currentVariantType],
  )

  const onZoomChange = useCallback(
    (zoom: number) => {
      setCropStates((previous) => ({
        ...previous,
        [currentVariantType]: {
          ...previous[currentVariantType],
          zoom,
          croppedAreaPixels: null,
          completed: false,
        },
      }))
    },
    [currentVariantType],
  )

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCropStates((previous) => ({
        ...previous,
        [currentVariantType]: {
          ...previous[currentVariantType],
          draftAreaPixels: croppedAreaPixels,
        },
      }))
    },
    [currentVariantType],
  )

  const saveCurrentCrop = () => {
    setErrorMsg('')
    const draftCrop = cropStates[currentVariantType].draftAreaPixels
    if (!draftCrop || draftCrop.width <= 0 || draftCrop.height <= 0) {
      setErrorMsg(
        `Crop area is not ready for ${formatVariantLabel(currentVariantType)}.`,
      )
      return false
    }

    setCropStates((previous) => ({
      ...previous,
      [currentVariantType]: {
        ...previous[currentVariantType],
        croppedAreaPixels: draftCrop,
        completed: true,
      },
    }))
    return true
  }

  const saveAndNext = () => {
    if (
      saveCurrentCrop() &&
      currentVariantIndex < VARIANT_SEQUENCE.length - 1
    ) {
      setCurrentVariantIndex(currentVariantIndex + 1)
    }
  }

  const confirmAll = async () => {
    setErrorMsg('')
    const missingCrops = VARIANT_SEQUENCE.filter(
      (type) =>
        !cropStates[type].completed || !cropStates[type].croppedAreaPixels,
    )
    if (missingCrops.length > 0) {
      setErrorMsg(`Missing crops for: ${missingCrops.join(', ')}`)
      return
    }

    setIsProcessing(true)
    setErrorMsg('Creating image files...')
    try {
      onConfirm(
        await createMultiVariantImages(
          previewUrl,
          cropStates,
          file.name,
          fileNamePrefix,
        ),
      )
    } catch (error) {
      console.error('Error processing variants:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMsg(`Error: ${message}`)
      alert(`Failed to process image variants: ${message}`)
      setIsProcessing(false)
    }
  }

  const completedCount = VARIANT_SEQUENCE.filter((type) =>
    isVariantCropSaved(cropStates, type),
  ).length

  return {
    previewUrl,
    imageDimensions,
    currentVariantIndex,
    setCurrentVariantIndex,
    currentVariantType,
    currentState,
    isProcessing,
    cropStates,
    errorMsg,
    completedCount,
    allCropsSaved: completedCount === VARIANT_SEQUENCE.length,
    currentCropSaved:
      currentState.completed && currentState.croppedAreaPixels !== null,
    onCropChange,
    onZoomChange,
    onCropComplete,
    saveAndNext,
    confirmAll,
  }
}
