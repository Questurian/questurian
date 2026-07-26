import type { SchemaPublisherConfig } from '../../../../../shared/seo/services/schema-publisher-config.service'
import type { SeoSection } from '../../../../../shared/seo/types'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'
import { buildPayloadArticleMetadataPatch } from './payload-article-metadata.service'
import {
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleStructuredDataTemplate,
  serializeStandardArticleStructuredDataTemplate,
  shouldAutoManageStandardArticleStructuredData
} from './standard-article-seo.service'
import type { EditorialPublishTargetStatus } from './editorial-stage-publish-validation.service'

type StructuredDataContext = {
  stagedArticle: StagedArticle
  seoSection: SeoSection
  locationLabel: string
  publisherConfig: SchemaPublisherConfig
}

function buildStructuredData({
  stagedArticle,
  seoSection,
  locationLabel,
  publisherConfig
}: StructuredDataContext): string {
  return serializeStandardArticleStructuredDataTemplate(
    buildStandardArticleStructuredDataTemplate({
      stagedArticle: {
        ...stagedArticle,
        seoSection
      },
      locationLabel,
      publisherConfig
    })
  )
}

export function prepareEditorialPublishSeoSection(
  input: StructuredDataContext & { targetStatus: EditorialPublishTargetStatus }
): SeoSection {
  const nextStructuredData = buildStructuredData(input)
  const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
    buildLegacyStandardArticleStructuredDataTemplate({
      stagedArticle: {
        ...input.stagedArticle,
        seoSection: input.seoSection
      },
      locationLabel: input.locationLabel
    })
  )
  const shouldRefreshDraft = shouldAutoManageStandardArticleStructuredData({
    existingStructuredData: input.seoSection.structuredData.trim(),
    nextStructuredData,
    legacyStructuredData
  })

  if (input.targetStatus !== 'published' && !shouldRefreshDraft) {
    return input.seoSection
  }

  return {
    ...input.seoSection,
    structuredData: nextStructuredData
  }
}

export function preparePublishedEditorialSeoSection(
  input: StructuredDataContext & {
    publishedArticle: PayloadArticleDoc
  }
): SeoSection {
  const metadataPatch = buildPayloadArticleMetadataPatch({
    doc: input.publishedArticle,
    fallbackAuthorName: input.publisherConfig.defaultAuthorName
  })

  return {
    ...input.seoSection,
    structuredData: buildStructuredData({
      ...input,
      stagedArticle: {
        ...input.stagedArticle,
        ...metadataPatch,
        seoSection: input.seoSection
      }
    })
  }
}
