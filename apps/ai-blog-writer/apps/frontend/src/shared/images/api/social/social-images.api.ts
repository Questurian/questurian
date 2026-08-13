import type {
  GenerateSocialImageResponse,
  UploadSocialImageResponse
} from '../contracts/image-api.contracts'
import { generateSocialImageApi } from '../generate-social-image.api'
import { uploadSocialImageApi } from '../upload-social-image.api'

export type { GenerateSocialImageResponse, UploadSocialImageResponse }

export type FeaturedSocialImageRef =
  | { featuredAssetId: number }
  | { featuredMediaSetId: number }

export async function generateSocialImageFromFeatured(
  ref: FeaturedSocialImageRef,
): Promise<GenerateSocialImageResponse> {
  return generateSocialImageApi({ ...ref })
}

export async function uploadSocialImage(
  file: File,
  altText: string,
  locationRef: number,
  photographerCredit: string
): Promise<UploadSocialImageResponse> {
  return uploadSocialImageApi({
    file,
    altText,
    locationRef,
    photographerCredit
  })
}
