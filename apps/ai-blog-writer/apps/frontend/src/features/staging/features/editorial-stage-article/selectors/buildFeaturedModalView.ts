import type { Dispatch, SetStateAction } from 'react'
import type { Location } from '../../../api'
import type { StagedArticle } from '../../../types'
import { isStagedArticleEditingLocked } from '../../../utils/staged-article-sync'
import type { FeaturedModalViewProps } from './editorial-stage-view.types'

type BuildFeaturedModalViewInput = {
  showImageModal: boolean
  stagedArticle: StagedArticle
  featuredImageRequirementLabel: string
  selectedLocation?: Location
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  setShowImageModal: Dispatch<SetStateAction<boolean>>
}

export function buildFeaturedModalView(input: BuildFeaturedModalViewInput): FeaturedModalViewProps {
  return {
    show: input.showImageModal,
    publishedToPayload: isStagedArticleEditingLocked(input.stagedArticle),
    onClose: () => input.setShowImageModal(false),
        locationRef: input.selectedLocation?.id ?? null,
    selectedFeaturedImageId: input.stagedArticle.featuredImageId ?? null,
    requirementLabel: input.featuredImageRequirementLabel,
    onSelectAssetId: (assetId: number) => input.updateStagedArticle({ featuredImageId: assetId }),
  }
}
