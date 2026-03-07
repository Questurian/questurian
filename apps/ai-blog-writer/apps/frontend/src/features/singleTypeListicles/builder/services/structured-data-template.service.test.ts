import {
  buildSingleTypeListicleStructuredDataTemplate,
  validateSingleTypeListicleStructuredDataShape,
} from './structured-data-template.service'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function buildDraft(): SingleTypeListicleDraft {
  return {
    draftId: 'draft-1',
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    editorModelName: 'gemini-2.5-flash',
    title: 'Best Gelato in Lima',
    location: 'Lima, Peru',
    locationRef: 1,
    listicleType: 'dining',
    targetItemCount: 1,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: true,
    step3_in_update_mode: false,
    header: {
      introMarkdown: 'Discover the most incredible and unforgettable gelato experiences in Lima with this deeply detailed long-form intro that keeps adding extra adjectives and promotional copy far beyond what a schema description should ever contain for crawlers parsing metadata.',
      introJsonText: '',
      featuredImage: null,
    },
    items: [
      {
        id: 'item-1',
        blockType: 'data-dining',
        item: 101,
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        blurbMarkdown: 'Discover Blu Gelateria, widely recognized as one of the best gelato shops in Lima with handcrafted flavors, world-class service, and an unforgettable experience that keeps going with long SEO-heavy filler language for no structured-data reason.',
        blurbJsonText: '',
      },
    ],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: '',
        url: '',
      },
      twitterCard: {
        card: 'summary',
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
    status: 'draft',
    articleType: 'single-type-listicle',
    updatedAt: new Date().toISOString(),
  }
}

function buildRelatedItems(): RelatedItemOption[] {
  return [
    {
      id: 101,
      title: 'Blu Gelateria',
      location: 'Barranco',
      status: 'published',
    },
  ]
}

function run() {
  const draft = buildDraft()
  draft.seoSection.openGraph.url = 'https://example.com/best-gelato-lima'
  draft.seoSection.openGraph.imageUrl = 'https://example.com/featured.jpg'
  draft.status = 'published'
  draft.payloadStatus = 'published'
  draft.payloadPublishedAt = '2026-03-01T09:15:00.000Z'
  draft.payloadUpdatedAt = '2026-03-01T10:30:00.000Z'
  draft.payloadAuthorName = 'Alan Malpartida'
  draft.updatedAt = '2026-03-01T10:30:00.000Z'

  const template = buildSingleTypeListicleStructuredDataTemplate({
    draft,
    relatedItems: buildRelatedItems(),
    publisherConfig: {
      siteName: 'Questurian',
      logoUrl: 'https://example.com/logo.png',
      defaultAuthorName: 'Questurian Editorial',
    },
  })

  const graph = Array.isArray(template['@graph']) ? template['@graph'] : []
  const blogPosting = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'BlogPosting'
  )) as Record<string, unknown> | undefined
  const itemList = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'ItemList'
  )) as Record<string, unknown> | undefined
  const itemListElement = Array.isArray(itemList?.itemListElement) ? itemList.itemListElement : []
  const firstItem = itemListElement[0] as Record<string, unknown> | undefined
  const firstEntity = (firstItem?.item && typeof firstItem.item === 'object')
    ? firstItem.item as Record<string, unknown>
    : undefined

  const blogDescription = typeof blogPosting?.description === 'string' ? blogPosting.description : ''
  const entityDescription = typeof firstEntity?.description === 'string' ? firstEntity.description : ''
  const itemListId = typeof itemList?.['@id'] === 'string' ? itemList['@id'] : ''
  const blogPostingId = typeof blogPosting?.['@id'] === 'string' ? blogPosting['@id'] : ''
  const blogMainEntity = (blogPosting?.mainEntity && typeof blogPosting.mainEntity === 'object')
    ? blogPosting.mainEntity as Record<string, unknown>
    : {}
  const blogAuthor = (blogPosting?.author && typeof blogPosting.author === 'object')
    ? blogPosting.author as Record<string, unknown>
    : {}
  const blogPublisher = (blogPosting?.publisher && typeof blogPosting.publisher === 'object')
    ? blogPosting.publisher as Record<string, unknown>
    : {}
  const publisherLogo = (blogPublisher.logo && typeof blogPublisher.logo === 'object')
    ? blogPublisher.logo as Record<string, unknown>
    : {}

  assert(blogDescription.length > 0, 'Expected blog posting description to be populated.')
  assert(entityDescription.length > 0, 'Expected list item description to be populated.')
  assert(blogDescription.length <= 220, 'BlogPosting description should be capped at 220 chars.')
  assert(entityDescription.length <= 220, 'Entity description should be capped at 220 chars.')
  assert(!/^discover\s+/i.test(blogDescription), 'BlogPosting description should not keep promotional lead-in.')
  assert(!/^discover\s+/i.test(entityDescription), 'Entity description should not keep promotional lead-in.')
  assert(blogPostingId === 'https://example.com/best-gelato-lima#single-type-listicle-blog-posting', 'Expected canonical BlogPosting @id.')
  assert(itemListId === 'https://example.com/best-gelato-lima#single-type-listicle-item-list', 'Expected canonical ItemList @id.')
  assert(blogMainEntity['@type'] === 'ItemList', 'Expected BlogPosting mainEntity @type to be ItemList.')
  assert(blogMainEntity['@id'] === itemListId, 'Expected BlogPosting mainEntity @id to match ItemList @id.')
  assert(blogPosting?.datePublished === '2026-03-01T09:15:00.000Z', 'Expected ISO datePublished from hydrated publishedAt.')
  assert(blogPosting?.dateModified === '2026-03-01T10:30:00.000Z', 'Expected ISO dateModified from hydrated updatedAt.')
  assert(blogPosting?.image === 'https://example.com/featured.jpg', 'Expected article image from OG image URL.')
  assert(blogAuthor.name === 'Alan Malpartida', 'Expected author from hydrated Payload author metadata.')
  assert(blogPublisher.name === 'Questurian', 'Expected publisher from shared schema config.')
  assert(publisherLogo.url === 'https://example.com/logo.png', 'Expected publisher logo URL.')
  assert((blogPosting?.mainEntityOfPage as Record<string, unknown> | undefined)?.['@id'] === 'https://example.com/best-gelato-lima', 'Expected mainEntityOfPage to use canonical URL.')

  const validationIssues = validateSingleTypeListicleStructuredDataShape({
    structuredData: template,
    draft,
    targetStatus: 'published',
  })

  assert(validationIssues.length === 0, `Expected published structured data to validate, received: ${validationIssues.join('; ')}`)
}

run()
