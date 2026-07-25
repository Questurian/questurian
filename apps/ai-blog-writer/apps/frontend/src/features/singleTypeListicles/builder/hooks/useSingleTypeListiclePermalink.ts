import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { resolveEditorAssistModelName } from '../../../staging/api'
import { generateTitleWithAi, rewriteBlockWithAi } from '../../api'
import type { LocationOption, SingleTypeListicleDraft } from '../../types'
import { buildArticleOgUrl } from '../../../../shared/seo/utils/buildArticleOgUrl'

type UseSingleTypeListiclePermalinkParams = {
  draft: SingleTypeListicleDraft | null
  locations: LocationOption[]
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onError: (message: string) => void
}

export function useSingleTypeListiclePermalink({
  draft,
  locations,
  setDraft,
  onError,
}: UseSingleTypeListiclePermalinkParams) {
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false)

  const generateTitle = useCallback(async ({ prompt }: { prompt: string }): Promise<string> => {
    if (!draft) {
      throw new Error('Draft is not loaded yet.')
    }

    const response = await generateTitleWithAi({
      currentTitle: draft.title.trim(),
      prompt: prompt.trim(),
      modelName: resolveEditorAssistModelName(draft.editorModelName),
    })
    const title = response.title?.trim()
    if (!title) {
      throw new Error('AI returned an empty title.')
    }
    return title
  }, [draft])

  const applySlugAndOgUrl = useCallback((slug: string) => {
    const location = locations.find((entry) => entry.locationKey === draft?.location)
    const newUrl = slug.trim() && location?.country
      ? buildArticleOgUrl(location.country, location.city, 'maps', slug.trim())
      : undefined

    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        payloadSlug: slug,
        updatedAt: new Date().toISOString(),
        ...(newUrl
          ? {
              seoSection: {
                ...current.seoSection,
                openGraph: { ...current.seoSection.openGraph, url: newUrl },
              },
            }
          : {}),
      }
    })
  }, [draft?.location, locations, setDraft])

  const generateSlug = useCallback(async () => {
    if (!draft?.title.trim()) return
    setIsGeneratingSlug(true)
    try {
      const response = await rewriteBlockWithAi({
        prompt: `Generate a clean SEO-friendly URL slug for this article title:\n\nTitle: ${draft.title.trim()}\n\nRules:\n- Think like a real user searching Google.\n- Keep the most important search keywords.\n- Remove filler words like "the," "a," "an," "in," "of," "to," and "for" unless they are needed.\n- Keep it short, readable, and specific.\n- Use lowercase only.\n- Use hyphens between words.\n- Do not keyword-stuff.\n- Do not add words that are not strongly related to the title.\n- Prefer search-intent wording over matching the title exactly.\n- Return only the slug, no explanation.\n\nExample:\nTitle: The Best Steakhouses in Las Vegas\nSlug: best-steakhouses-las-vegas`,
        blockContent: draft.title.trim(),
        modelName: resolveEditorAssistModelName(draft.editorModelName),
        articleTitle: draft.title.trim(),
      })
      const slug = response.rewritten_content?.trim()
      if (slug) applySlugAndOgUrl(slug)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to generate slug with AI.')
    } finally {
      setIsGeneratingSlug(false)
    }
  }, [applySlugAndOgUrl, draft, onError])

  const autoFillOgUrl = useCallback(() => {
    if (!draft) return
    const slug = draft.payloadSlug?.trim()
    const location = locations.find((entry) => entry.locationKey === draft.location)
    if (!slug || !location?.country) return
    const url = buildArticleOgUrl(location.country, location.city, 'maps', slug)
    if (!url) return

    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        seoSection: {
          ...current.seoSection,
          openGraph: { ...current.seoSection.openGraph, url },
        },
      }
    })
  }, [draft, locations, setDraft])

  return {
    generateTitle,
    applySlugAndOgUrl,
    generateSlug,
    isGeneratingSlug,
    autoFillOgUrl,
  }
}
