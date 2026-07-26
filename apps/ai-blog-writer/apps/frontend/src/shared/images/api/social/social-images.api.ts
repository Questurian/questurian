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
  token: string
): Promise<GenerateSocialImageResponse> {
  return generateSocialImageApi({ ...ref, token })
}

export async function uploadSocialImage(
  file: File,
  altText: string,
  locationRef: number,
  token: string,
  photographerCredit: string
): Promise<UploadSocialImageResponse> {
  return uploadSocialImageApi({
    file,
    altText,
    locationRef,
    token,
    photographerCredit
  })
}
