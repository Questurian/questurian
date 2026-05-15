import type { UploadImageResponse } from './api/imagesApi'
import type { ImageVariantType } from './utils/imageProcessing'

export interface ImageUploadProps {
  externalRef: string
  fileNamePrefix?: string
  locationRef: number
  token: string
  initialAltText?: string
  initialPhotographerCredit?: string
  onComplete: (result: UploadImageResponse) => void
  onCancel?: () => void
  className?: string
}

export type UploadStage = 'select' | 'metadata' | 'crop' | 'uploading'
export type VariantUploadFile = { type: ImageVariantType; file: File }
