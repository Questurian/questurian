import {
  ImagePicker,
  pickUploadedAssetId,
  resolveMediaSetPreviewAssetId,
  type ImagePickerResult,
} from '../../shared/images/picker'
import type { MediaAsset } from '../../shared/api/payload/payload.types'

type FeaturedImagePickerProps = {
  isOpen: boolean
  selectedId: number | null
  token: string
  locationRef: number | null
  payloadSourceMode?: 'assets' | 'mediaSets'
  payloadVariant?: MediaAsset['variant']
  requireMediaSet?: boolean
  uploadExternalRefBase?: string
  uploadFileNameTitle?: string
  /** @deprecated No longer used — the unified picker hydrates the selected asset itself. */
  prefetchedPayloadAssets?: MediaAsset[]
  onSelect: (mediaAssetId: number) => void
  onSelectMediaSet?: (mediaSetId: number) => void
  onClose: () => void
}

/**
 * Thin adapter over the unified {@link ImagePicker} (ADR 0020). Preserves the
 * legacy `onSelect(mediaAssetId)` contract its call sites depend on: an asset
 * selection emits its id, a media-set selection emits the set's preview-asset id,
 * and an upload/import emits the preferred-variant asset id.
 */
export function FeaturedImagePicker({
  isOpen,
  selectedId,
  token,
  locationRef,
  payloadSourceMode = 'assets',
  payloadVariant,
  requireMediaSet = true,
  uploadExternalRefBase = 'featured-image-picker',
  uploadFileNameTitle = 'featured-image',
  onSelect,
  onSelectMediaSet,
  onClose,
}: FeaturedImagePickerProps) {
  const handleSelect = (result: ImagePickerResult) => {
    if (result.kind === 'assets') {
      const id = result.assets[0]?.id
      if (id != null) onSelect(id)
      return
    }
    if (result.kind === 'mediaSets') {
      const mediaSetId = result.mediaSets[0]?.id
      if (mediaSetId != null && onSelectMediaSet) {
        onSelectMediaSet(Number(mediaSetId))
        return
      }
      const id = resolveMediaSetPreviewAssetId(result.mediaSets[0])
      if (id != null) onSelect(id)
      return
    }
    if (onSelectMediaSet) {
      const mediaSetId = Number(result.response.mediaSetId)
      if (!Number.isNaN(mediaSetId)) {
        onSelectMediaSet(mediaSetId)
        return
      }
    }
    const id = pickUploadedAssetId(result.response, payloadVariant ?? 'editorial')
    if (id != null) onSelect(id)
  }

  return (
    <ImagePicker
      isOpen={isOpen}
      token={token}
      locationRef={locationRef}
      selectedId={selectedId}
      query={{ browseUnit: payloadSourceMode, variant: payloadVariant, requireMediaSet }}
      uploadExternalRefBase={uploadExternalRefBase}
      uploadFileNameTitle={uploadFileNameTitle}
      importAltContextLabel="Featured"
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}
