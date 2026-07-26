import type { Area } from 'react-easy-crop'
import {
  VARIANT_SEQUENCE,
  VARIANT_SPECS,
  type ImageVariantType
} from './image-variant-policy'

export interface CropData {
  x: number
  y: number
  width: number
  height: number
}

export interface CropState {
  variantType: ImageVariantType
  crop: { x: number; y: number }
  zoom: number
  draftAreaPixels: Area | null
  croppedAreaPixels: Area | null
  completed: boolean
}

export type CropStates = Record<ImageVariantType, CropState>

export function calculateDefaultCrop(
  imageWidth: number,
  imageHeight: number,
  targetRatio: number
): Area {
  const imageRatio = imageWidth / imageHeight
  let width: number
  let height: number

  if (imageRatio > targetRatio) {
    height = imageHeight
    width = height * targetRatio
  } else {
    width = imageWidth
    height = width / targetRatio
  }

  return {
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height
  }
}

function createEmptyCropState(variantType: ImageVariantType): CropState {
  return {
    variantType,
    crop: { x: 0, y: 0 },
    zoom: 1,
    draftAreaPixels: null,
    croppedAreaPixels: null,
    completed: false
  }
}

export function initializeCropStates(
  imageWidth?: number,
  imageHeight?: number
): CropStates {
  const states = Object.fromEntries(
    VARIANT_SEQUENCE.map((variantType) => [
      variantType,
      createEmptyCropState(variantType)
    ])
  ) as CropStates

  if (imageWidth && imageHeight) {
    for (const type of VARIANT_SEQUENCE) {
      states[type].draftAreaPixels = calculateDefaultCrop(
        imageWidth,
        imageHeight,
        VARIANT_SPECS[type].ratio
      )
    }
  }

  return states
}
