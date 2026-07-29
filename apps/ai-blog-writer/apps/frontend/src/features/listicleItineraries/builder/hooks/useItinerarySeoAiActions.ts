import { useCallback, useState } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import { generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured } from '../../../../shared/images/api/social/social-images.api'
import { generateSeoMetadataWithAi } from '../../api'
import {
  buildItineraryAiArticleContext,
  getItineraryAiArticleTitle
} from '../services/ai-rewrite.service'
import {
  applySeoAiPatch,
  buildSeoAiPrompt,
  buildSeoAiSeed,
  getSeoAiTargetLabel,
  parseSeoAiPatch,
  seoAiPatchCoversTarget,
  type SeoAiTarget
} from '../services/seo-ai.service'
import type { ItineraryBuilderAiActionsParams } from './itineraryBuilderAiActions.types'

type Params = Pick<
  ItineraryBuilderAiActionsParams,
  | 'token'
  | 'draft'
  | 'setDraft'
  | 'canonicalStructuredData'
  | 'onError'
  | 'setResult'
>

export function useItinerarySeoAiActions({
  token,
  draft,
  setDraft,
  canonicalStructuredData,
  onError,
  setResult
}: Params) {
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] =
    useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)

  const generateSeoWithAi = useCallback(
    async (target: SeoAiTarget = 'all'): Promise<void> => {
      if (!draft) return

      const articleContext = buildItineraryAiArticleContext(draft).trim()
      const articleTitle = getItineraryAiArticleTitle(draft).trim()
      const structuredDataTemplate = canonicalStructuredData
      const hasSourceContent = Boolean(draft.title.trim() || articleContext)
      if (!hasSourceContent) {
        onError('Add article content before generating SEO with AI.')
        return
      }

      onError('')
      setResult(null)
      setIsGeneratingSeoTarget(target)

      try {
        const response = await generateSeoMetadataWithAi({
          prompt: buildSeoAiPrompt({
            articleType: 'listicle-itinerary',
            location: draft.location,
            target,
            structuredDataTemplate:
              target === 'structuredData' ? structuredDataTemplate : undefined
          }),
          seed: buildSeoAiSeed(draft.seoSection),
          modelName: resolveEditorAssistModelName(draft.editorModelName),
          articleTitle,
          articleContext: articleContext || undefined
        })

        if (
          !response.seo_patch ||
          Object.keys(response.seo_patch).length === 0
        ) {
          throw new Error('AI returned an empty SEO patch.')
        }

        const seoPatch = parseSeoAiPatch(JSON.stringify(response.seo_patch))
        // The "all" target below drops structuredData on purpose (the template
        // owns it), so it cannot count towards this patch having done anything.
        const appliedPatch = target === 'all'
          ? { ...seoPatch, structuredData: undefined }
          : seoPatch
        if (!seoAiPatchCoversTarget(appliedPatch, target)) {
          throw new Error(
            `AI returned no usable ${getSeoAiTargetLabel(target)}. Nothing was changed — try again.`
          )
        }

        setDraft((current) => {
          if (!current) return current
          const patchedSeo = applySeoAiPatch(
            current.seoSection,
            seoPatch,
            target
          )
          return {
            ...current,
            seoSection:
              target === 'all'
                ? {
                    ...patchedSeo,
                    structuredData: current.seoSection.structuredData
                  }
                : patchedSeo
          }
        })

        if (target === 'all') {
          setResult(
            'SEO fields generated with AI (images and structured data unchanged).'
          )
        } else {
          setResult(
            `${getSeoAiTargetLabel(target)} generated with AI (images unchanged).`
          )
        }
      } catch (err) {
        onError(
          err instanceof Error ? err.message : 'Failed to generate SEO with AI.'
        )
      } finally {
        setIsGeneratingSeoTarget(null)
      }
    },
    [canonicalStructuredData, draft, onError, setDraft, setResult]
  )

  const regenerateStructuredDataFromTemplate = useCallback(() => {
    if (!canonicalStructuredData) return
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          structuredData: canonicalStructuredData
        }
      }
    })
    setResult('Structured data regenerated from the itinerary template.')
    onError('')
  }, [canonicalStructuredData, onError, setDraft, setResult])

  const generateSeoImageFromFeatured = useCallback(async (): Promise<void> => {
    if (!draft) return

    const featuredMediaSetId = draft.header.featuredMediaSet ?? null
    const featuredAssetId = draft.header.featuredImage
    if (!featuredMediaSetId && !featuredAssetId) {
      onError(
        'Select a featured image in Step 2 before generating social image URLs.'
      )
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
      const response = await requestGenerateSocialImageFromFeatured(
        featuredMediaSetId
          ? { featuredMediaSetId }
          : { featuredAssetId: featuredAssetId as number },
        token
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
            openGraph: {
              ...current.seoSection.openGraph,
              imageUrl: bunnyUrl
            },
            twitterCard: {
              ...current.seoSection.twitterCard,
              imageUrl: bunnyUrl
            }
          }
        }
      })

      setResult(
        'Social image generated from featured image. Bunny URL applied to OG and Twitter.'
      )
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Failed to generate social image from featured image.'
      )
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [draft, onError, setDraft, setResult, token])

  return {
    isGeneratingSeoTarget,
    isGeneratingSeoImage,
    generateSeoWithAi,
    regenerateStructuredDataFromTemplate,
    generateSeoImageFromFeatured
  }
}
