import { describe, it } from 'vitest'
import type { StagedArticle } from '../../../types'
import {
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleSeoAiPrompt,
  buildStandardArticleStructuredDataTemplate,
  serializeStandardArticleStructuredDataTemplate,
  shouldAutoManageStandardArticleStructuredData,
  validateStandardArticleSeoSection,
} from './standard-article-seo.service'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function buildStagedArticle(): StagedArticle {
  return {
    id: 'staged-1',
    runId: 'run-1',
    originalTitle: 'Weekend in Lima',
    originalContent: 'Lima is full of cafes and coastal views.\n\nBarranco adds galleries and sunset walks.',
    originalType: 'Travel Guide',
    title: 'Weekend in Lima',
    content: 'Lima is full of cafes and coastal views.\n\nBarranco adds galleries and sunset walks.',
    blocks: [
      {
        id: 'block-1',
        type: 'text',
        content: 'Lima is full of cafes and coastal views.',
      },
      {
        id: 'block-2',
        type: 'text',
        content: 'Barranco adds galleries and sunset walks.',
      },
    ],
    editorialBlocks: [],
    locationId: 10,
    sharedNeighborhoods: [],
    editorModelName: 'gemini-2.5-flash',
    featuredImageId: 99,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: true,
    step3_in_update_mode: false,
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: 'https://example.com/lima.jpg',
        url: 'https://example.com/weekend-in-lima',
      },
      twitterCard: {
        card: 'summary_large_image',
        title: '',
        description: '',
        imageUrl: '',
      },
      structuredData: '',
      robots: {
        index: 'index',
        follow: 'follow',
      },
    },
    syncBehavior: 'draft-sync',
    lexicalConverted: false,
    publishedToPayload: false,
    payloadArticleId: undefined,
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-04T15:45:00.000Z',
  }
}

function runStructuredDataTemplateTest() {
  const stagedArticle = {
    ...buildStagedArticle(),
    payloadStatus: 'published' as const,
    payloadPublishedAt: '2026-03-03T09:00:00.000Z',
    payloadUpdatedAt: '2026-03-05T12:30:00.000Z',
    payloadAuthorName: 'Payload Author',
  }
  const structuredData = buildStandardArticleStructuredDataTemplate({
    stagedArticle,
    locationLabel: 'Lima, Peru',
    publisherConfig: {
      siteName: 'Questurian',
      logoUrl: 'https://example.com/logo.png',
      defaultAuthorName: 'Questurian Editorial',
    },
  })

  const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
  const blogPosting = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'BlogPosting'
  )) as Record<string, unknown> | undefined
  const place = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'Place'
  )) as Record<string, unknown> | undefined

  assert(Boolean(blogPosting), 'Expected BlogPosting node in standard article structured data.')
  assert(Boolean(place), 'Expected Place node in standard article structured data.')
  assert(blogPosting?.articleBody === undefined, 'Expected articleBody to be omitted from BlogPosting.')
  assert(blogPosting?.wordCount === undefined, 'Expected wordCount to be omitted from BlogPosting.')
  assert(blogPosting?.dateModified === '2026-03-05T12:30:00.000Z', 'Expected ISO dateModified from Payload updatedAt.')
  assert(blogPosting?.datePublished === '2026-03-03T09:00:00.000Z', 'Expected ISO datePublished from Payload publishedAt.')
  assert(blogPosting?.image === 'https://example.com/lima.jpg', 'Expected image URL from OG image.')
  assert((blogPosting?.mainEntityOfPage as Record<string, unknown> | undefined)?.['@id'] === 'https://example.com/weekend-in-lima', 'Expected mainEntityOfPage to use canonical URL.')
  assert((blogPosting?.contentLocation as Record<string, unknown> | undefined)?.['@id'] === place?.['@id'], 'Expected contentLocation to reference the Place @id.')
  assert((blogPosting?.about as Record<string, unknown> | undefined)?.['@id'] === place?.['@id'], 'Expected about to reference the Place @id.')
  assert((blogPosting?.mainEntity as Record<string, unknown> | undefined)?.['@id'] === place?.['@id'], 'Expected mainEntity to reference the Place @id.')

  const author = blogPosting?.author as Record<string, unknown> | undefined
  const publisher = blogPosting?.publisher as Record<string, unknown> | undefined
  const publisherLogo = publisher?.logo as Record<string, unknown> | undefined

  assert(author?.name === 'Payload Author', 'Expected author from hydrated Payload author metadata.')
  assert(publisher?.name === 'Questurian', 'Expected publisher from shared schema publisher config.')
  assert(publisherLogo?.url === 'https://example.com/logo.png', 'Expected publisher logo URL.')
}

function runValidationTest() {
  const stagedArticle = buildStagedArticle()
  const structuredData = buildStandardArticleStructuredDataTemplate({
    stagedArticle,
    locationLabel: 'Lima, Peru',
  })

  const validIssues = validateStandardArticleSeoSection({
    seoSection: {
      ...stagedArticle.seoSection!,
      structuredData: serializeStandardArticleStructuredDataTemplate(structuredData),
    },
    locationLabel: 'Lima, Peru',
  })
  assert(validIssues.length === 0, `Expected valid graph structured data, received: ${validIssues.join('; ')}`)

  const legacyIssues = validateStandardArticleSeoSection({
    seoSection: {
      ...stagedArticle.seoSection!,
      structuredData: serializeStandardArticleStructuredDataTemplate(
        buildLegacyStandardArticleStructuredDataTemplate({
          stagedArticle,
          locationLabel: 'Lima, Peru',
        }),
      ),
    },
    locationLabel: 'Lima, Peru',
  })
  assert(
    legacyIssues.includes('Structured Data must include an "@graph" array.'),
    'Expected legacy single-object BlogPosting structured data to fail graph validation.',
  )
}

function runAutoManagementTest() {
  const stagedArticle = buildStagedArticle()
  const nextStructuredData = serializeStandardArticleStructuredDataTemplate(
    buildStandardArticleStructuredDataTemplate({
      stagedArticle,
      locationLabel: 'Lima, Peru',
    }),
  )
  const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
    buildLegacyStandardArticleStructuredDataTemplate({
      stagedArticle,
      locationLabel: 'Lima, Peru',
    }),
  )

  assert(
    shouldAutoManageStandardArticleStructuredData({
      existingStructuredData: legacyStructuredData,
      nextStructuredData,
      legacyStructuredData,
    }),
    'Expected exact legacy auto-generated structured data to auto-upgrade.',
  )

  const manualLegacy = JSON.stringify({
    ...JSON.parse(legacyStructuredData),
    description: 'Custom manual structured data copy.',
  }, null, 2)

  assert(
    !shouldAutoManageStandardArticleStructuredData({
      existingStructuredData: manualLegacy,
      nextStructuredData,
      legacyStructuredData,
    }),
    'Expected manually edited legacy structured data to remain user-managed.',
  )
}

function runPromptRulesTest() {
  const prompt = buildStandardArticleSeoAiPrompt({
    location: 'Lima, Peru',
    target: 'structuredData',
  })

  assert(
    prompt.includes('keep @graph with BlogPosting as the primary node'),
    'Expected prompt to preserve the BlogPosting graph node.',
  )
  assert(
    prompt.includes('preserve the Place node plus BlogPosting contentLocation/about/mainEntity references to the Place @id'),
    'Expected prompt to preserve linked Place references.',
  )
  assert(
    prompt.includes('do not add articleBody or wordCount to BlogPosting'),
    'Expected prompt to omit articleBody and wordCount.',
  )
  assert(
    prompt.includes('preserve author and publisher nodes when present'),
    'Expected prompt to preserve author and publisher nodes.',
  )
}

describe('standard article seo service', () => {
  it('builds the structured data template', runStructuredDataTemplateTest)
  it('validates the structured data graph shape', runValidationTest)
  it('keeps auto-managed structured data opt-in rules', runAutoManagementTest)
  it('preserves the graph requirements in the AI prompt', runPromptRulesTest)
})
