import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SeoSection } from '../../../../../shared/seo/types'
import { buildArticleOgUrl } from '../../../../../shared/seo/utils/buildArticleOgUrl'
import type { Location } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { EditorialStageArticleApi } from '../types'

type SetSeoSection = (
  next: SeoSection | ((current: SeoSection) => SeoSection)
) => void

type UseStandardArticlePermalinkParams = {
  api: EditorialStageArticleApi
  stagedArticle?: StagedArticle
  selectedLocation?: Location
  updateSeoSection: SetSeoSection
  setLocalError: Dispatch<SetStateAction<string | null>>
}

export function useStandardArticlePermalink({
  api,
  stagedArticle,
  selectedLocation,
  updateSeoSection,
  setLocalError,
}: UseStandardArticlePermalinkParams) {
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false)

  const generateSlug = useCallback(async () => {
    if (!stagedArticle?.title.trim()) return
    setIsGeneratingSlug(true)
    try {
      const response = await api.rewriteBlockWithAi({
        prompt: `Generate a clean SEO-friendly URL slug for this article title:\n\nTitle: ${stagedArticle.title.trim()}\n\nRules:\n- Think like a real user searching Google.\n- Keep the most important search keywords.\n- Remove filler words like "the," "a," "an," "in," "of," "to," and "for" unless they are needed.\n- Keep it short, readable, and specific.\n- Use lowercase only.\n- Use hyphens between words.\n- Do not keyword-stuff.\n- Do not add words that are not strongly related to the title.\n- Prefer search-intent wording over matching the title exactly.\n- Return only the slug, no explanation.\n\nExample:\nTitle: The Best Steakhouses in Las Vegas\nSlug: best-steakhouses-las-vegas`,
        blockContent: stagedArticle.title.trim(),
        articleTitle: stagedArticle.title.trim(),
      })
      const slug = response.rewritten_content?.trim()
      if (slug) {
        // The shell's update callback is the authoritative staged Draft writer.
        return slug
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to generate slug with AI.')
    } finally {
      setIsGeneratingSlug(false)
    }
    return undefined
  }, [api, setLocalError, stagedArticle])

  const autoFillOgUrl = useCallback(() => {
    const slug = stagedArticle?.payloadSlug?.trim()
    const country = selectedLocation?.country
    if (!slug || !country) return
    const url = buildArticleOgUrl(country, selectedLocation.city, null, slug)
    if (!url) return
    updateSeoSection((current) => ({
      ...current,
      openGraph: { ...current.openGraph, url },
    }))
  }, [selectedLocation, stagedArticle?.payloadSlug, updateSeoSection])

  return {
    generateSlug,
    isGeneratingSlug,
    autoFillOgUrl,
  }
}
