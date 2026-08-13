import type { UploadImageResponse } from './api/contracts/image-api.contracts'
import type { ImageVariantType } from './utils/imageProcessing'

export interface ImageUploadProps {
  externalRef: string
  fileNamePrefix?: string
  locationRef: number
  initialAltText?: string
  initialPhotographerCredit?: string
  onComplete: (result: UploadImageResponse) => void
  onCancel?: () => void
  className?: string
}

export type UploadStage = 'select' | 'metadata' | 'crop' | 'uploading'
export type VariantUploadFile = { type: ImageVariantType; file: File }
