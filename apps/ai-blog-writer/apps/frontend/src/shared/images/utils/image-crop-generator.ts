import { loadImage } from './browser-image-loader'
import type { CropData, CropStates } from './image-crop-state'
import { generateVariantFileName } from './image-filename-metadata'
import {
  VARIANT_SEQUENCE,
  VARIANT_SPECS,
  type ImageVariantType
} from './image-variant-policy'

const WEBP_QUALITY = 0.85

function createWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      },
      'image/webp',
      WEBP_QUALITY
    )
  })
}

export async function createCroppedImage(
  imageSrc: string,
  cropData: CropData,
  targetDimensions: { width: number; height: number },
  fileName: string
): Promise<File> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = targetDimensions.width
  canvas.height = targetDimensions.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to get canvas context')
  }

  context.drawImage(
    image,
    cropData.x,
    cropData.y,
    cropData.width,
    cropData.height,
    0,
    0,
    targetDimensions.width,
    targetDimensions.height
  )

  const blob = await createWebpBlob(canvas)
  const webpFileName = fileName.replace(/\.[^/.]+$/, '') + '.webp'
  return new File([blob], webpFileName, { type: 'image/webp' })
}

export async function createMultiVariantImages(
  imageSrc: string,
  cropStates: CropStates,
  fileName: string,
  fileNamePrefix?: string
): Promise<{ type: ImageVariantType; file: File }[]> {
  return Promise.all(
    VARIANT_SEQUENCE.map(async (variantType) => {
      const state = cropStates[variantType]
      const spec = VARIANT_SPECS[variantType]

      if (!state.completed || !state.croppedAreaPixels) {
        throw new Error(`Missing crop data for variant: ${variantType}`)
      }

      const croppedFile = await createCroppedImage(
        imageSrc,
        state.croppedAreaPixels,
        { width: spec.width, height: spec.height },
        generateVariantFileName(fileName, variantType, fileNamePrefix)
      )

      return { type: variantType, file: croppedFile }
    })
  )
}
