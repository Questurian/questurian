import { buildSingleTypeListicleStructuredDataTemplate } from './structured-data-template.service'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function buildDraft(): SingleTypeListicleDraft {
  return {
    draftId: 'draft-1',
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
  draft.updatedAt = '2026-03-01T10:30:00.000Z'

  const template = buildSingleTypeListicleStructuredDataTemplate({
    draft,
    relatedItems: buildRelatedItems(),
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
  const blogMainEntity = (blogPosting?.mainEntity && typeof blogPosting.mainEntity === 'object')
    ? blogPosting.mainEntity as Record<string, unknown>
    : {}

  assert(blogDescription.length > 0, 'Expected blog posting description to be populated.')
  assert(entityDescription.length > 0, 'Expected list item description to be populated.')
  assert(blogDescription.length <= 220, 'BlogPosting description should be capped at 220 chars.')
  assert(entityDescription.length <= 220, 'Entity description should be capped at 220 chars.')
  assert(!/^discover\s+/i.test(blogDescription), 'BlogPosting description should not keep promotional lead-in.')
  assert(!/^discover\s+/i.test(entityDescription), 'Entity description should not keep promotional lead-in.')
  assert(itemListId === 'https://example.com/best-gelato-lima#single-type-listicle-item-list', 'Expected canonical ItemList @id.')
  assert(blogMainEntity['@type'] === 'ItemList', 'Expected BlogPosting mainEntity @type to be ItemList.')
  assert(blogMainEntity['@id'] === itemListId, 'Expected BlogPosting mainEntity @id to match ItemList @id.')
  assert(blogPosting?.datePublished === '2026-03-01', 'Expected datePublished for published drafts.')
  assert(blogPosting?.dateModified === '2026-03-01', 'Expected dateModified from draft updatedAt.')
  assert(blogPosting?.image === 'https://example.com/featured.jpg', 'Expected article image from OG image URL.')
}

run()
