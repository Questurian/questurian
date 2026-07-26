import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import {
  generateSocialImageFromFeatured,
  uploadSocialImage,
} from '../../../../shared/images/api/social/social-images.api'
import { generateSeoMetadataWithAi } from '../../api'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import {
  buildListicleAiArticleContext,
  getListicleAiArticleTitle,
} from '../services/ai-rewrite.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
} from '../services/seo-ai.service'
import type { SeoAiTarget } from '../services/seo-ai.service'
import { validateOgSocialImageFile } from '../services/seo-social-image-upload.service'
import {
  buildSingleTypeListicleStructuredDataTemplate,
  serializeStructuredDataTemplate,
} from '../services/structured-data-template.service'

type UseSingleTypeListicleSeoParams = {
  token?: string | null
  draft: SingleTypeListicleDraft | null
  relatedItems: RelatedItemOption[]
  selectedLocationRefId: number | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}

export function useSingleTypeListicleSeo({
  token,
  draft,
  relatedItems,
  selectedLocationRefId,
  setDraft,
  onError,
  setResult,
}: UseSingleTypeListicleSeoParams) {
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [isUploadingOgImage, setIsUploadingOgImage] = useState(false)

  const generateSeo = useCallback(async (target: SeoAiTarget = 'all'): Promise<void> => {
    if (!draft) return

    const articleContext = buildListicleAiArticleContext(draft, relatedItems).trim()
    const articleTitle = getListicleAiArticleTitle(draft).trim()
    const structuredDataTemplate = serializeStructuredDataTemplate(
      buildSingleTypeListicleStructuredDataTemplate({ draft, relatedItems }),
    )
    if (!draft.title.trim() && !articleContext) {
      onError('Add article content before generating SEO with AI.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await generateSeoMetadataWithAi({
        prompt: buildSeoAiPrompt({
          articleType: draft.listicleType
            ? `single-type-listicle (${draft.listicleType})`
            : 'single-type-listicle',
          location: draft.location,
          target,
          structuredDataTemplate: target === 'structuredData' || target === 'all'
            ? structuredDataTemplate
            : undefined,
        }),
        seed: buildSeoAiSeed(draft.seoSection),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })

      if (!response.seo_patch || Object.keys(response.seo_patch).length === 0) {
        throw new Error('AI returned an empty SEO patch.')
      }

      const seoPatch = parseSeoAiPatch(JSON.stringify(response.seo_patch))
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: applySeoAiPatch(current.seoSection, seoPatch, target),
        }
      })
      setResult(
        target === 'all'
          ? 'SEO fields generated with AI (images unchanged).'
          : `${getSeoAiTargetLabel(target)} generated with AI (images unchanged).`,
      )
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [draft, onError, relatedItems, setDraft, setResult])

  const generateImageFromFeatured = useCallback(async (): Promise<void> => {
    if (!draft) return

    const featuredMediaSetId = draft.header.featuredMediaSet ?? null
    const featuredAssetId = draft.header.featuredImage
    if (!featuredMediaSetId && !featuredAssetId) {
      onError('Select a featured image in Step 2 before generating social image URLs.')
      return
    }
    if (!token) {
      onError('You must be logged in to generate social image URLs.')
      return
    }

    onError('')
    setResult(null)
    setIsGeneratingSeoImage(true)

    try {
      const response = await generateSocialImageFromFeatured(
        featuredMediaSetId
          ? { featuredMediaSetId }
          : { featuredAssetId: featuredAssetId as number },
        token,
      )
      const bunnyUrl = response.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Generated social image is missing Bunny URL.')
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: {
            ...current.seoSection,
            openGraph: { ...current.seoSection.openGraph, imageUrl: bunnyUrl },
            twitterCard: { ...current.seoSection.twitterCard, imageUrl: bunnyUrl },
          },
        }
      })
      setResult('Social image generated from featured image. Bunny URL applied to OG and Twitter.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to generate social image from featured image.')
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [draft, onError, setDraft, setResult, token])

  const uploadOgImageFile = useCallback(async (file: File): Promise<void> => {
    if (!draft) return

    const fileIssue = validateOgSocialImageFile(file)
    if (fileIssue) {
      onError(fileIssue)
      throw new Error(fileIssue)
    }
    if (!token) {
      const message = 'You must be logged in to upload social image URLs.'
      onError(message)
      throw new Error(message)
    }

    const locationRef = selectedLocationRefId ?? draft.locationRef
    if (!locationRef || locationRef < 1) {
      const message = 'Select a location in Step 1 before uploading social images.'
      onError(message)
      throw new Error(message)
    }

    onError('')
    setResult(null)
    setIsUploadingOgImage(true)

    try {
      const articleTitle = draft.title.trim() || 'Untitled listicle'
      const response = await uploadSocialImage(
        file,
        `Social share image for ${articleTitle}`,
        locationRef,
        token,
        'Questurian Creative',
      )
      const bunnyUrl = response.generatedImageUrl.trim()
      if (!bunnyUrl) {
        throw new Error('Uploaded social image is missing Bunny URL.')
      }

      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          seoSection: {
            ...current.seoSection,
            openGraph: { ...current.seoSection.openGraph, imageUrl: bunnyUrl },
            twitterCard: { ...current.seoSection.twitterCard, imageUrl: bunnyUrl },
          },
        }
      })
      setResult('Custom OG image uploaded and applied to OG and Twitter image fields.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload OG image.'
      onError(message)
      throw error instanceof Error ? error : new Error(message)
    } finally {
      setIsUploadingOgImage(false)
    }
  }, [draft, onError, selectedLocationRefId, setDraft, setResult, token])

  return {
    generateSeo,
    isGeneratingSeoTarget,
    generateImageFromFeatured,
    isGeneratingSeoImage,
    uploadOgImageFile,
    isUploadingOgImage,
  }
}
