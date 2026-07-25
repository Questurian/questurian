import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  generateSocialImageFromFeatured,
  uploadSocialImage,
} from '../../../../../shared/images'
import type { SeoSection } from '../../../../../shared/seo/types'
import {
  applySeoAiPatch,
  buildSeoAiSeed,
  parseSeoAiPatch,
  type SeoAiTarget,
} from '../../../../../shared/seo/services/seo-ai.service'
import { resolveEditorAssistModelName } from '../../../api'
import type { StagedArticle } from '../../../types'
import {
  buildStandardArticleContext,
  buildStandardArticleSeoAiPrompt,
} from '../services/standard-article-seo.service'
import type { EditorialStageArticleApi } from '../types'

type UseStandardArticleSeoActionsParams = {
  api: EditorialStageArticleApi
  token?: string | null
  stagedArticle?: StagedArticle
  featureLabel: string
  selectedLocationLabel: string
  seoSection: SeoSection
  updateSeoSection: (
    next: SeoSection | ((current: SeoSection) => SeoSection)
  ) => void
  setLocalError: Dispatch<SetStateAction<string | null>>
  setLocalResult: Dispatch<SetStateAction<string | null>>
}

export function useStandardArticleSeoActions({
  api,
  token,
  stagedArticle,
  featureLabel,
  selectedLocationLabel,
  seoSection,
  updateSeoSection,
  setLocalError,
  setLocalResult,
}: UseStandardArticleSeoActionsParams) {
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [isUploadingOgImage, setIsUploadingOgImage] = useState(false)

  const generateSeo = useCallback(async (target: SeoAiTarget = 'all') => {
    if (!stagedArticle) return

    const articleContext = buildStandardArticleContext(stagedArticle).trim()
    const articleTitle = stagedArticle.title.trim()
    if (!articleTitle && !articleContext) {
      setLocalError('Add article content before generating SEO with AI.')
      return
    }

    setLocalError(null)
    setLocalResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await api.generateSeoMetadataWithAi({
        prompt: buildStandardArticleSeoAiPrompt({
          location: selectedLocationLabel || undefined,
          target,
        }),
        seed: buildSeoAiSeed(seoSection),
        modelName: resolveEditorAssistModelName(stagedArticle.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })
      if (!response.seo_patch || Object.keys(response.seo_patch).length === 0) {
        throw new Error('AI returned an empty SEO patch.')
      }

      const seoPatch = parseSeoAiPatch(JSON.stringify(response.seo_patch))
      updateSeoSection((current) => applySeoAiPatch(current, seoPatch, target))
      setLocalResult(`Updated ${target === 'all' ? 'SEO metadata' : target} with AI.`)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [
    api,
    seoSection,
    selectedLocationLabel,
    setLocalError,
    setLocalResult,
    stagedArticle,
    updateSeoSection,
  ])

  const generateImageFromFeatured = useCallback(async () => {
    if (!token || !stagedArticle?.featuredImageId) {
      setLocalError('Select a featured image before generating an OG image.')
      return
    }

    setLocalError(null)
    setLocalResult(null)
    setIsGeneratingSeoImage(true)
    try {
      const response = await generateSocialImageFromFeatured(
        { featuredAssetId: stagedArticle.featuredImageId },
        token,
      )
      const socialImageUrl = response.generatedImageUrl.trim()
      if (!socialImageUrl) {
        throw new Error('Social image generation did not return a usable URL.')
      }
      updateSeoSection((current) => ({
        ...current,
        openGraph: { ...current.openGraph, imageUrl: socialImageUrl },
        twitterCard: { ...current.twitterCard, imageUrl: socialImageUrl },
      }))
      setLocalResult('Generated a 1200x630 social image from the featured image.')
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to generate social image.')
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [setLocalError, setLocalResult, stagedArticle?.featuredImageId, token, updateSeoSection])

  const uploadOgImageFile = useCallback(async (file: File) => {
    if (!token || !stagedArticle?.locationId) {
      throw new Error('Select a location before uploading an OG image.')
    }

    setLocalError(null)
    setLocalResult(null)
    setIsUploadingOgImage(true)
    try {
      const response = await uploadSocialImage(
        file,
        stagedArticle.title.trim() || `${featureLabel} social image`,
        stagedArticle.locationId,
        token,
        '',
      )
      const socialImageUrl = response.generatedImageUrl.trim()
      if (!socialImageUrl) {
        throw new Error('OG image upload did not return a usable URL.')
      }
      updateSeoSection((current) => ({
        ...current,
        openGraph: { ...current.openGraph, imageUrl: socialImageUrl },
        twitterCard: { ...current.twitterCard, imageUrl: socialImageUrl },
      }))
      setLocalResult('Uploaded and applied a custom OG image.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload OG image.'
      setLocalError(message)
      throw error instanceof Error ? error : new Error(message)
    } finally {
      setIsUploadingOgImage(false)
    }
  }, [
    featureLabel,
    setLocalError,
    setLocalResult,
    stagedArticle?.locationId,
    stagedArticle?.title,
    token,
    updateSeoSection,
  ])

  return {
    generateSeo,
    isGeneratingSeoTarget,
    generateImageFromFeatured,
    isGeneratingSeoImage,
    uploadOgImageFile,
    isUploadingOgImage,
  }
}
