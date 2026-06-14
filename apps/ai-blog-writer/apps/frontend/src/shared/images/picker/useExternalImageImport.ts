import { useCallback, useState } from 'react'
import {
  uploadImageVariants,
  type ImageVariantType,
  type UploadImageResponse,
  type UploadProgress,
} from '..'
import { fetchExternalImageSource } from '../external/external-images.api'
import type {
  ExternalImageProvider,
  PexelsPhoto,
  UnsplashPhoto,
} from '../external/external-images.types'
import {
  buildExternalAltText,
  buildExternalImportRef,
  buildExternalPhotographerCredit,
  buildImageFileNamePrefix,
  getPexelsPhotoImportUrl,
  getUnsplashPhotoImportUrl,
} from '../external/external-import.utils'

export type ExternalImagePhoto = UnsplashPhoto | PexelsPhoto

export type ExternalCropDraft = {
  provider: ExternalImageProvider
  photoId: string | number
  sourceUrl: string
  file: File
  externalRef: string
  fileNamePrefix: string
  altText: string
  photographerCredit: string
}

type UseExternalImageImportParams = {
  token?: string
  /** Required to upload into Payload; when null, prepare/confirm refuse with a notice. */
  locationRef: number | null
  /** Stable prefix for the generated external ref, e.g. 'featured-image-picker'. */
  externalRefBase: string
  /** Title seed for the generated filename prefix, e.g. 'featured-image'. */
  fileNameTitle: string
  /** Context label woven into the default alt text, e.g. 'Featured'. */
  altContextLabel: string
  /** Notice shown when locationRef is missing. */
  locationRequiredMessage?: string
}

export type ExternalImageImport = {
  cropDraft: ExternalCropDraft | null
  importingId: string | number | null
  uploadProgress: UploadProgress | null
  isUploading: boolean
  error: string | null
  prepareCropDraft: (photo: ExternalImagePhoto, provider: ExternalImageProvider) => Promise<void>
  updateDraft: (patch: Partial<Pick<ExternalCropDraft, 'altText' | 'photographerCredit'>>) => void
  confirmUpload: (
    variantFiles: Array<{ type: ImageVariantType; file: File }>,
  ) => Promise<UploadImageResponse | null>
  cancel: () => void
  reset: () => void
}

const DEFAULT_LOCATION_REQUIRED = 'Set a location before importing images into Payload.'

/**
 * The Unsplash/Pexels download → crop → upload flow, extracted from its three
 * near-identical copies (FeaturedImagePicker, the staging modals, CoverImagePicker).
 * Emits a raw UploadImageResponse; the shell decides whether to surface it as a
 * single selection or push it into the multi-select buffer (ADR 0020).
 */
export function useExternalImageImport({
  token,
  locationRef,
  externalRefBase,
  fileNameTitle,
  altContextLabel,
  locationRequiredMessage = DEFAULT_LOCATION_REQUIRED,
}: UseExternalImageImportParams): ExternalImageImport {
  const [cropDraft, setCropDraft] = useState<ExternalCropDraft | null>(null)
  const [importingId, setImportingId] = useState<string | number | null>(null)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setCropDraft(null)
    setImportingId(null)
    setUploadProgress(null)
    setIsUploading(false)
    setError(null)
  }, [])

  const prepareCropDraft = useCallback(
    async (photo: ExternalImagePhoto, provider: ExternalImageProvider) => {
      if (locationRef === null) {
        setError(locationRequiredMessage)
        return
      }
      if (!token) {
        setError('Please sign in again before importing images.')
        return
      }

      setImportingId(photo.id)
      setError(null)
      setUploadProgress({ status: 'processing', progress: 20, message: 'Downloading source image...' })

      const sourceUrl =
        provider === 'unsplash'
          ? getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
          : getPexelsPhotoImportUrl(photo as PexelsPhoto)
      const externalRef = buildExternalImportRef(externalRefBase, provider, photo.id)
      const fileNamePrefix = buildImageFileNamePrefix(fileNameTitle, externalRef)

      try {
        const source = await fetchExternalImageSource({ sourceUrl, provider, photoId: photo.id }, token)
        const file = new File([source.blob], source.fileName, {
          type: source.contentType || source.blob.type || 'image/jpeg',
        })
        setCropDraft({
          provider,
          photoId: photo.id,
          sourceUrl,
          file,
          externalRef,
          fileNamePrefix,
          altText: buildExternalAltText(photo.alt, altContextLabel),
          photographerCredit: buildExternalPhotographerCredit(photo.photographer, provider),
        })
        setUploadProgress(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to download external image')
        setUploadProgress(null)
      } finally {
        setImportingId(null)
      }
    },
    [locationRef, token, externalRefBase, fileNameTitle, altContextLabel, locationRequiredMessage],
  )

  const updateDraft = useCallback(
    (patch: Partial<Pick<ExternalCropDraft, 'altText' | 'photographerCredit'>>) => {
      setCropDraft((current) => (current ? { ...current, ...patch } : current))
    },
    [],
  )

  const confirmUpload = useCallback(
    async (variantFiles: Array<{ type: ImageVariantType; file: File }>) => {
      if (!cropDraft) return null
      if (locationRef === null) {
        setError(locationRequiredMessage)
        return null
      }
      if (!token) {
        setError('Please sign in again before importing images.')
        return null
      }
      if (!cropDraft.photographerCredit.trim()) {
        setError('Photographer credit is required before importing.')
        return null
      }

      setIsUploading(true)
      setError(null)
      try {
        const result = await uploadImageVariants(
          variantFiles,
          cropDraft.externalRef,
          cropDraft.altText,
          locationRef,
          token,
          cropDraft.photographerCredit,
          (progress) => setUploadProgress(progress),
        )
        reset()
        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload external image variants')
        setUploadProgress(null)
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [cropDraft, locationRef, token, locationRequiredMessage, reset],
  )

  return {
    cropDraft,
    importingId,
    uploadProgress,
    isUploading,
    error,
    prepareCropDraft,
    updateDraft,
    confirmUpload,
    cancel: reset,
    reset,
  }
}
