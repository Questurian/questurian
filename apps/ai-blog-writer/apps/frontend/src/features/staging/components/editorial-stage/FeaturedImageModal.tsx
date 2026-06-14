import { ImagePicker, pickUploadedAssetId, type ImagePickerResult } from '../../../../shared/images/picker'
import {
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_VARIANT,
  FEATURED_IMAGE_WIDTH,
} from '../../features/editorial-stage-article/constants'

type FeaturedImageModalProps = {
  show: boolean
  publishedToPayload: boolean
  onClose: () => void
  token?: string
  locationRef: number | null
  selectedFeaturedImageId: number | null
  requirementLabel: string
  onSelectAssetId: (assetId: number) => void
}

/**
 * Featured-image selection, rendered by the unified {@link ImagePicker} in
 * single-select assets mode (editorial 4:3). Selecting an asset or uploading one
 * emits its id, which the caller writes to `featuredImageId` (ADR 0020).
 */
export function FeaturedImageModal({
  show,
  publishedToPayload,
  onClose,
  token,
  locationRef,
  selectedFeaturedImageId,
  requirementLabel,
  onSelectAssetId,
}: FeaturedImageModalProps) {
  const handleSelect = (result: ImagePickerResult) => {
    if (result.kind === 'assets') {
      const id = result.assets[0]?.id
      if (id != null) onSelectAssetId(id)
      return
    }
    if (result.kind === 'upload') {
      const id = pickUploadedAssetId(result.response, FEATURED_IMAGE_VARIANT)
      if (id != null) onSelectAssetId(id)
    }
  }

  return (
    <ImagePicker
      isOpen={show && !publishedToPayload}
      token={token}
      locationRef={locationRef}
      selectedId={selectedFeaturedImageId}
      query={{
        browseUnit: 'assets',
        variant: FEATURED_IMAGE_VARIANT,
        exactDimensions: { width: FEATURED_IMAGE_WIDTH, height: FEATURED_IMAGE_HEIGHT },
        requirementLabel,
      }}
      uploadExternalRefBase="featured-image"
      uploadFileNameTitle="featured-image"
      importAltContextLabel="Featured"
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
