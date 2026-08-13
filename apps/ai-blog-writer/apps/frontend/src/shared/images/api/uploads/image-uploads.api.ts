import type { ImageVariantType } from '../../utils/imageProcessing'
import type {
  UploadImageResponse,
  UploadProgress
} from '../contracts/image-api.contracts'
import { uploadSingleApi } from './upload-single.api'
import { uploadVariantsApi } from './upload-variants.api'

export type { UploadImageResponse, UploadProgress }

export async function uploadImageVariants(
  variantFiles: { type: ImageVariantType; file: File }[],
  externalRef: string,
  altText: string,
  locationRef: number | undefined,
  photographerCredit: string,
  onProgress?: (progress: UploadProgress) => void,
  tags?: number[]
): Promise<UploadImageResponse> {
  return uploadVariantsApi({
    variantFiles,
    externalRef,
    altText,
    locationRef,
    photographerCredit,
    onProgress,
    tags
  })
}

export async function uploadImage(
  file: File,
  externalRef: string,
  altText: string,
  locationRef: number,
  photographerCredit: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadImageResponse> {
  return uploadSingleApi({
    file,
    externalRef,
    altText,
    locationRef,
    photographerCredit,
    onProgress
  })
}
