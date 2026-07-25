import { useEffect, useState } from 'react'
import { fetchMediaAssets } from '../../api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import { searchPexelsImages, searchUnsplashImages } from '../external/external-images.api'
import type { PexelsPhoto, UnsplashPhoto } from '../external/external-images.types'
import type { UploadImageResponse } from '../api/imagesApi'
import type { ImageVariantType } from '../utils/imageProcessing'
import type {
  ImagePickerProps,
  ImagePickerTab,
} from './imagePicker.types'
import { buildUploadIdentity } from './imagePicker.utils'
import { pickUploadedAssetId } from './mediaSet.utils'
import { useExternalImageImport } from './useExternalImageImport'
import { useImagePickerData } from './useImagePickerData'
import { useImagePickerSelectionBuffer } from './useImagePickerSelectionBuffer'
import { useProviderImageSearch } from './useProviderImageSearch'

export function useImagePickerController({
  isOpen,
  token,
  locationRef,
  query,
  selection = { mode: 'single' },
  selectedId = null,
  uploadExternalRefBase = 'image-picker',
  uploadFileNameTitle = 'image',
  importExternalRefBase,
  importFileNameTitle,
  importAltContextLabel = 'Image',
  payloadOnly = false,
  onSelect,
  onClose,
}: ImagePickerProps) {
  const isMulti = selection.mode === 'multiple'
  const requiredCount = isMulti ? selection.count : 1
  const [activeTab, setActiveTab] = useState<ImagePickerTab>('payload')
  const [search, setSearch] = useState('')
  const [uploadIdentity, setUploadIdentity] = useState(() =>
    buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle),
  )
  const buffer = useImagePickerSelectionBuffer(requiredCount)
  const data = useImagePickerData({ isOpen, token, query, search, selectedId })
  const unsplash = useProviderImageSearch<UnsplashPhoto>(searchUnsplashImages)
  const pexels = useProviderImageSearch<PexelsPhoto>(searchPexelsImages)
  const importer = useExternalImageImport({
    token,
    locationRef,
    externalRefBase: importExternalRefBase ?? uploadExternalRefBase,
    fileNameTitle: importFileNameTitle ?? uploadFileNameTitle,
    altContextLabel: importAltContextLabel,
  })

  useEffect(() => {
    if (!isOpen) return
    setActiveTab('payload')
    setSearch('')
    buffer.reset()
    setUploadIdentity(
      buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle),
    )
    unsplash.reset()
    pexels.reset()
    importer.reset()
    // Reset only on the open transition; controller methods are intentionally
    // omitted because their identities follow transient state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const switchTab = (next: ImagePickerTab) => {
    if (payloadOnly && next !== 'payload') return
    if (next !== activeTab) importer.reset()
    if (next === 'upload') {
      setUploadIdentity(
        buildUploadIdentity(uploadExternalRefBase, uploadFileNameTitle),
      )
    }
    setActiveTab(next)
  }

  const handlePayloadAssetClick = (asset: MediaAsset) => {
    if (isMulti) {
      buffer.addToBuffer(asset.id, asset, 'toggle')
      return
    }
    onSelect({ kind: 'assets', assets: [asset] })
    onClose()
  }

  const handleMediaSetClick = (mediaSet: MediaSet) => {
    if (isMulti) {
      buffer.addMediaSetToBuffer(mediaSet)
      return
    }
    onSelect({ kind: 'mediaSets', mediaSets: [mediaSet] })
    onClose()
  }

  const handleUploadComplete = (response: UploadImageResponse) => {
    onSelect({ kind: 'upload', response })
    onClose()
  }

  const handleConfirmMulti = () => {
    if (query.browseUnit === 'mediaSets') {
      const mediaSets = buffer.bufferIds
        .map((id) => buffer.bufferMediaSets.get(id))
        .filter((mediaSet): mediaSet is MediaSet => Boolean(mediaSet))
      if (mediaSets.length !== requiredCount) return
      onSelect({ kind: 'mediaSets', mediaSets })
      onClose()
      return
    }

    const assets = buffer.bufferIds
      .map((id) => buffer.bufferAssets.get(id))
      .filter((asset): asset is MediaAsset => Boolean(asset))
    if (assets.length !== requiredCount) return
    onSelect({ kind: 'assets', assets })
    onClose()
  }

  const handleExternalCropConfirm = async (
    variantFiles: Array<{ type: ImageVariantType; file: File }>,
  ) => {
    const response = await importer.confirmUpload(variantFiles)
    if (!response) return
    if (!isMulti) {
      onSelect({ kind: 'upload', response })
      onClose()
      return
    }

    const assetId = pickUploadedAssetId(response, query.variant ?? undefined)
    if (assetId === null || !token) return
    try {
      const result = await fetchMediaAssets(token, { limit: 1, id: assetId })
      buffer.addToBuffer(assetId, result.docs[0] ?? null, 'rolling')
    } catch {
      // Import succeeded but resolution failed; the asset remains in Payload.
    }
  }

  return {
    activeTab,
    search,
    setSearch,
    uploadIdentity,
    isMulti,
    requiredCount,
    uploadAvailable: !isMulti && !payloadOnly,
    data,
    buffer,
    unsplash,
    pexels,
    importer,
    switchTab,
    handlePayloadAssetClick,
    handleMediaSetClick,
    handleUploadComplete,
    handleConfirmMulti,
    handleExternalCropConfirm,
  }
}
