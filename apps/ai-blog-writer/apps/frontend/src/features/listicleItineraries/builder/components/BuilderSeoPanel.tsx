import type { Dispatch, SetStateAction } from 'react'
import { SeoEditorPanel } from '../../../../shared/seo/components/SeoEditorPanel'
import type { ListicleItineraryDraft } from '../../types'
import type { SeoAiTarget } from '../services/seo-ai.service'

type BuilderSeoPanelProps = {
  draft: ListicleItineraryDraft
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  onGenerateSeoWithAi: (target?: SeoAiTarget) => Promise<void>
  isGeneratingSeoTarget: SeoAiTarget | null
  onGenerateSeoImageFromFeatured: () => Promise<void>
  isGeneratingSeoImage: boolean
  onRegenerateStructuredData: () => void
  canRegenerateStructuredData: boolean
  onAutoFillOgUrl?: () => void
}

export function BuilderSeoPanel({
  draft,
  setDraft,
  onGenerateSeoWithAi,
  isGeneratingSeoTarget,
  onGenerateSeoImageFromFeatured,
  isGeneratingSeoImage,
  onRegenerateStructuredData,
  canRegenerateStructuredData,
  onAutoFillOgUrl,
}: BuilderSeoPanelProps) {
  return (
    <SeoEditorPanel
      seoSection={draft.seoSection}
      setSeoSection={(next) => {
        setDraft((current) => {
          if (!current) return current
          return {
            ...current,
            seoSection: typeof next === 'function' ? next(current.seoSection) : next,
          }
        })
      }}
      onGenerateSeoWithAi={onGenerateSeoWithAi}
      isGeneratingSeoTarget={isGeneratingSeoTarget}
      onGenerateSeoImageFromFeatured={onGenerateSeoImageFromFeatured}
      isGeneratingSeoImage={isGeneratingSeoImage}
      onRegenerateStructuredData={onRegenerateStructuredData}
      canRegenerateStructuredData={canRegenerateStructuredData}
      onAutoFillOgUrl={onAutoFillOgUrl}
    />
  )
}
