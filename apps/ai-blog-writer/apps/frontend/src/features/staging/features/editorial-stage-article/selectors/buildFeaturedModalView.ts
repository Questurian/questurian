import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { UploadImageResponse } from '../../../../../features/images'
import type { Location, MediaAsset, PexelsPhoto, UnsplashPhoto } from '../../../api'
import type { StagedArticle } from '../../../types'
import { isStagedArticleEditingLocked } from '../../../utils/staged-article-sync'
import type {
  ExternalImageCropDraft,
  ImageSourceOption,
  MediaVariant,
  PexelsOrientationOption,
} from '../types'
import type { FeaturedModalViewProps } from './editorial-stage-view.types'

type BuildFeaturedModalViewInput = {
  showImageModal: boolean
  stagedArticle: StagedArticle
  featuredImageRequirementLabel: string
  featuredImageSource: ImageSourceOption
  setFeaturedImageSource: Dispatch<SetStateAction<ImageSourceOption>>
  imageSearch: string
  setImageSearch: Dispatch<SetStateAction<string>>
  filteredFeaturedImageAssets: MediaAsset[]
  selectedFeaturedImage: MediaAsset | null
  selectedLocation?: Location
  featuredImageFileNamePrefix: string
  token?: string
  imageAltText: string
  imagePhotographerCredit: string
  setImageAltText: Dispatch<SetStateAction<string>>
  setImagePhotographerCredit: Dispatch<SetStateAction<string>>
  handleUploadComplete: (result: UploadImageResponse) => void
  externalImageCropDraft: ExternalImageCropDraft | null
  renderExternalCropEditor: (context: 'featured') => ReactNode
  unsplashFeaturedQuery: string
  setUnsplashFeaturedQuery: Dispatch<SetStateAction<string>>
  unsplashFeaturedOrientation: PexelsOrientationOption
  setUnsplashFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  unsplashFeaturedPerPage: number
  setUnsplashFeaturedPerPage: Dispatch<SetStateAction<number>>
  runFeaturedUnsplashSearch: () => Promise<void>
  isSearchingUnsplashFeatured: boolean
  unsplashFeaturedError: string | null
  unsplashFeaturedResults: UnsplashPhoto[]
  isImportingFeaturedExternalImage: boolean
  handleImportFeaturedExternalImage: (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: 'unsplash' | 'pexels'
  ) => Promise<void>
  pexelsFeaturedQuery: string
  setPexelsFeaturedQuery: Dispatch<SetStateAction<string>>
  pexelsFeaturedOrientation: PexelsOrientationOption
  setPexelsFeaturedOrientation: Dispatch<SetStateAction<PexelsOrientationOption>>
  pexelsFeaturedPerPage: number
  setPexelsFeaturedPerPage: Dispatch<SetStateAction<number>>
  runFeaturedPexelsSearch: () => Promise<void>
  isSearchingPexelsFeatured: boolean
  pexelsFeaturedError: string | null
  pexelsFeaturedResults: PexelsPhoto[]
  findPreferredVariantAsset: (assetId: number, preferredVariant: MediaVariant) => MediaAsset | null
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  getImageUrl: (img: MediaAsset) => string
  setShowImageModal: Dispatch<SetStateAction<boolean>>
}

export function buildFeaturedModalView(input: BuildFeaturedModalViewInput): FeaturedModalViewProps {
  return {
    base: {
      show: input.showImageModal,
      publishedToPayload: isStagedArticleEditingLocked(input.stagedArticle),
      onClose: () => input.setShowImageModal(false),
      featuredImageRequirementLabel: input.featuredImageRequirementLabel,
    },
    payload: {
      featuredImageSource: input.featuredImageSource,
      imageSearch: input.imageSearch,
      setImageSearch: input.setImageSearch,
      filteredFeaturedImageAssets: input.filteredFeaturedImageAssets,
      selectedFeaturedImage: input.selectedFeaturedImage,
    },
    upload: {
      selectedLocation: input.selectedLocation,
      stagedArticleId: input.stagedArticle.id,
      featuredImageFileNamePrefix: input.featuredImageFileNamePrefix,
      token: input.token,
      imageAltText: input.imageAltText,
      imagePhotographerCredit: input.imagePhotographerCredit,
      setImageAltText: input.setImageAltText,
      setImagePhotographerCredit: input.setImagePhotographerCredit,
      handleUploadComplete: input.handleUploadComplete,
    },
    external: {
      externalImageCropDraft: input.externalImageCropDraft,
      renderExternalCropEditor: input.renderExternalCropEditor,
      unsplashFeaturedQuery: input.unsplashFeaturedQuery,
      setUnsplashFeaturedQuery: input.setUnsplashFeaturedQuery,
      unsplashFeaturedOrientation: input.unsplashFeaturedOrientation,
      setUnsplashFeaturedOrientation: input.setUnsplashFeaturedOrientation,
      unsplashFeaturedPerPage: input.unsplashFeaturedPerPage,
      setUnsplashFeaturedPerPage: input.setUnsplashFeaturedPerPage,
      runFeaturedUnsplashSearch: input.runFeaturedUnsplashSearch,
      isSearchingUnsplashFeatured: input.isSearchingUnsplashFeatured,
      unsplashFeaturedError: input.unsplashFeaturedError,
      unsplashFeaturedResults: input.unsplashFeaturedResults,
      isImportingFeaturedExternalImage: input.isImportingFeaturedExternalImage,
      handleImportFeaturedExternalImage: input.handleImportFeaturedExternalImage,
      pexelsFeaturedQuery: input.pexelsFeaturedQuery,
      setPexelsFeaturedQuery: input.setPexelsFeaturedQuery,
      pexelsFeaturedOrientation: input.pexelsFeaturedOrientation,
      setPexelsFeaturedOrientation: input.setPexelsFeaturedOrientation,
      pexelsFeaturedPerPage: input.pexelsFeaturedPerPage,
      setPexelsFeaturedPerPage: input.setPexelsFeaturedPerPage,
      runFeaturedPexelsSearch: input.runFeaturedPexelsSearch,
      isSearchingPexelsFeatured: input.isSearchingPexelsFeatured,
      pexelsFeaturedError: input.pexelsFeaturedError,
      pexelsFeaturedResults: input.pexelsFeaturedResults,
    },
    actions: {
      setFeaturedImageSource: input.setFeaturedImageSource,
      findPreferredVariantAsset: input.findPreferredVariantAsset,
      updateStagedArticle: input.updateStagedArticle,
      getImageUrl: input.getImageUrl,
    },
  }
}
