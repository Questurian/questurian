import type { Dispatch, SetStateAction } from 'react'
import { SeoEditorPanel } from '../../../../shared/seo/components/SeoEditorPanel'
import type { SingleTypeListicleDraft } from '../../types'
import type { SeoAiTarget } from '../services/seo-ai.service'

type BuilderSeoPanelProps = {
  draft: SingleTypeListicleDraft
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onGenerateSeoWithAi: (target?: SeoAiTarget) => Promise<void>
  isGeneratingSeoTarget: SeoAiTarget | null
  onGenerateSeoImageFromFeatured: () => Promise<void>
  isGeneratingSeoImage: boolean
  onUploadOgImageFile: (file: File) => Promise<void>
  isUploadingOgImage: boolean
  onAutoFillOgUrl?: () => void
}

export function BuilderSeoPanel({
  draft,
  setDraft,
  onGenerateSeoWithAi,
  isGeneratingSeoTarget,
  onGenerateSeoImageFromFeatured,
  isGeneratingSeoImage,
  onUploadOgImageFile,
  isUploadingOgImage,
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
      onUploadOgImageFile={onUploadOgImageFile}
      isUploadingOgImage={isUploadingOgImage}
      onAutoFillOgUrl={onAutoFillOgUrl}
    />
  )
}
