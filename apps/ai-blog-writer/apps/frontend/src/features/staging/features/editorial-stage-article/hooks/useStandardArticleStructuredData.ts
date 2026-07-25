import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    if (!stagedArticle || !enabled) return

    const article = { ...stagedArticle, seoSection }
    const nextStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildStandardArticleStructuredDataTemplate({
        stagedArticle: article,
        locationLabel: selectedLocationLabel || undefined,
        publisherConfig: schemaPublisherConfig,
      }),
    )
    const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildLegacyStandardArticleStructuredDataTemplate({
        stagedArticle: article,
        locationLabel: selectedLocationLabel || undefined,
      }),
    )
    const existingStructuredData = seoSection.structuredData.trim()
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
    enabled,
    seoSection,
    selectedLocationLabel,
    stagedArticle,
    updateSeoSection,
  ])
}
