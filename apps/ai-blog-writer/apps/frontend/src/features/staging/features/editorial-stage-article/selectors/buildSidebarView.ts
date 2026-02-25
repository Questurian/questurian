import type { Dispatch, SetStateAction } from 'react'
import type { Location, MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { SidebarViewProps, PublishResult } from './editorial-stage-view.types'

type BuildSidebarViewInput = {
  stagedArticle: StagedArticle
  isPublishing: boolean
  allFieldsFilled: boolean
  missingPublishFields: string[]
  editorialBlockingMessages: string[]
  publishResult: PublishResult
  featuredImageRequirementLabel: string
  selectedFeaturedImage: MediaAsset | null
  getImageUrl: (asset: MediaAsset) => string
  setShowImageModal: Dispatch<SetStateAction<boolean>>
  locations: Location[]
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  onPublish: () => void
}

export function buildSidebarView(input: BuildSidebarViewInput): SidebarViewProps {
  return {
    stagedArticle: input.stagedArticle,
    isPublishing: input.isPublishing,
    allFieldsFilled: input.allFieldsFilled,
    missingPublishFields: input.missingPublishFields,
    editorialBlockingMessages: input.editorialBlockingMessages,
    publishResult: input.publishResult,
    featuredImageRequirementLabel: input.featuredImageRequirementLabel,
    selectedFeaturedImage: input.selectedFeaturedImage,
    getImageUrl: input.getImageUrl,
    onOpenFeaturedImageModal: () => input.setShowImageModal(true),
    locations: input.locations,
    onUpdateStagedArticle: input.updateStagedArticle,
    onPublish: input.onPublish,
  }
}
