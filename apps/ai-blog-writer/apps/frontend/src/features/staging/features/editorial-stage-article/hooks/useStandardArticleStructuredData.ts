import { useCallback, useEffect, useRef } from 'react'
import type { SeoSection } from '../../../../../shared/seo/types'
import { getSchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { StagedArticle } from '../../../types'
import {
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleStructuredDataTemplate,
  serializeStandardArticleStructuredDataTemplate,
  shouldAutoManageStandardArticleStructuredData,
} from '../services/standard-article-seo.service'

const schemaPublisherConfig = getSchemaPublisherConfig()

type UseStandardArticleStructuredDataParams = {
  stagedArticle?: StagedArticle
  seoSection: SeoSection
  selectedLocationLabel: string
  enabled: boolean
  updateSeoSection: (
    next: SeoSection | ((current: SeoSection) => SeoSection)
  ) => void
}

export function useStandardArticleStructuredData({
  stagedArticle,
  seoSection,
  selectedLocationLabel,
  enabled,
  updateSeoSection,
}: UseStandardArticleStructuredDataParams) {
  const lastAutoStructuredDataRef = useRef('')

  const buildFromTemplate = useCallback((): string => {
    if (!stagedArticle) return ''
    return serializeStandardArticleStructuredDataTemplate(
      buildStandardArticleStructuredDataTemplate({
        stagedArticle: { ...stagedArticle, seoSection },
        locationLabel: selectedLocationLabel || undefined,
        publisherConfig: schemaPublisherConfig,
      }),
    )
  }, [seoSection, selectedLocationLabel, stagedArticle])

  useEffect(() => {
    if (!stagedArticle || !enabled) return

    const article = { ...stagedArticle, seoSection }
    const nextStructuredData = buildFromTemplate()
    const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildLegacyStandardArticleStructuredDataTemplate({
        stagedArticle: article,
        locationLabel: selectedLocationLabel || undefined,
      }),
    )
    const existingStructuredData = seoSection.structuredData.trim()

    // A synced-and-clean article has to stay clean. The template's
    // `dateModified` is Payload's `updatedAt`, which every sync bumps, so
    // regenerating here would rewrite structuredData right after the sync
    // landed and re-raise the "Out of sync" banner the sync just cleared —
    // with a newer timestamp each click, so it could never be cleared. An
    // empty field is still worth filling: that is real new content, and the
    // sync it dirties settles here on the next pass.
    // Read the flags off the article, not the derived hook state: that state
    // lags a render behind and is still stale at this point.
    if (
      existingStructuredData
      && stagedArticle.publishedToPayload
      && !stagedArticle.hasUnsyncedPayloadChanges
    ) {
      return
    }

    const lastAutoStructuredData = lastAutoStructuredDataRef.current.trim()
    const isAutoManaged = shouldAutoManageStandardArticleStructuredData({
      existingStructuredData,
      lastAutoStructuredData,
      nextStructuredData,
      legacyStructuredData,
    })

    if (!isAutoManaged) return
    if (existingStructuredData === nextStructuredData) {
      lastAutoStructuredDataRef.current = nextStructuredData
      return
    }

    lastAutoStructuredDataRef.current = nextStructuredData
    updateSeoSection((current) => ({
      ...current,
      structuredData: nextStructuredData,
    }))
  }, [
    buildFromTemplate,
    enabled,
    seoSection,
    selectedLocationLabel,
    stagedArticle,
    updateSeoSection,
  ])

  // Manual escape hatch for the panel's "Regenerate from Template" button. The
  // auto-effect above only runs once Step 3 is locked and stops touching the
  // field the moment it diverges, so without this there is no way to pull a
  // stale value back in line with the template that publish will apply anyway.
  const regenerateFromTemplate = useCallback(() => {
    const nextStructuredData = buildFromTemplate()
    if (!nextStructuredData) return

    lastAutoStructuredDataRef.current = nextStructuredData
    updateSeoSection((current) => ({
      ...current,
      structuredData: nextStructuredData,
    }))
  }, [buildFromTemplate, updateSeoSection])

  return {
    regenerateFromTemplate,
    canRegenerateFromTemplate: Boolean(stagedArticle),
  }
}
