import {
  buildSingleTypeListicleStructuredDataTemplate,
  validateSingleTypeListicleStructuredDataShape,
} from './structured-data-template.service'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

function buildDraft(): SingleTypeListicleDraft {
  return {
    draftId: 'draft-1',
    payloadStatus: undefined,
    payloadSlug: undefined,
    payloadPublishedAt: undefined,
    payloadUpdatedAt: undefined,
    payloadAuthorName: undefined,
    editorModelName: 'claude-opus-4-8',
    listTone: 'elevated',
    title: 'Best Gelato in Lima',
    location: 'Lima, Peru',
    locationRef: 1,
    sharedNeighborhoods: [],
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
        tours: [],
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

describe('singleTypeListicles structured data template', () => {
  it('uses the public CMS origin for locally-served selected photos', () => {
    const draft = buildDraft()
    draft.items[0].selectedPhotos = [501]

    const relatedItems: RelatedItemOption[] = [{
      ...buildRelatedItems()[0],
      gallery: [{
        image: {
          id: 501,
          variants: {
            thumbnail: {
              id: 601,
              filename: 'blu-thumbnail.webp',
              url: 'http://localhost:4000/api/media-assets/file/blu-thumbnail.webp',
            },
          },
        },
      }],
    }]

    const template = buildSingleTypeListicleStructuredDataTemplate({ draft, relatedItems })
    const graph = template['@graph'] as Array<Record<string, unknown>>
    const itemList = graph.find((node) => node['@type'] === 'ItemList')
    const listItem = (itemList?.itemListElement as Array<Record<string, unknown>>)[0]
    const entity = listItem.item as Record<string, unknown>

    expect(entity.image).toBe(
      'https://cms.questurian.com/api/media-assets/file/blu-thumbnail.webp',
    )
  })

  it('builds valid published structured data with canonical metadata', () => {
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

    expect(blogDescription.length).toBeGreaterThan(0)
    expect(entityDescription.length).toBeGreaterThan(0)
    expect(blogDescription.length).toBeLessThanOrEqual(220)
    expect(entityDescription.length).toBeLessThanOrEqual(220)
    expect(blogDescription).not.toMatch(/^discover\s+/i)
    expect(entityDescription).not.toMatch(/^discover\s+/i)
    expect(blogPostingId).toBe('https://example.com/best-gelato-lima#single-type-listicle-blog-posting')
    expect(itemListId).toBe('https://example.com/best-gelato-lima#single-type-listicle-item-list')
    expect(blogMainEntity['@type']).toBe('ItemList')
    expect(blogMainEntity['@id']).toBe(itemListId)
    expect(blogPosting?.datePublished).toBe('2026-03-01T09:15:00.000Z')
    expect(blogPosting?.dateModified).toBe('2026-03-01T10:30:00.000Z')
    expect(blogPosting?.image).toBe('https://example.com/featured.jpg')
    expect(blogAuthor.name).toBe('Alan Malpartida')
    expect(blogPublisher.name).toBe('Questurian')
    expect(publisherLogo.url).toBe('https://example.com/logo.png')
    expect((blogPosting?.mainEntityOfPage as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://example.com/best-gelato-lima',
    )
    expect(blogPosting?.inLanguage).toBe('en')
    expect(firstEntity?.category).toBeUndefined()

    const validationIssues = validateSingleTypeListicleStructuredDataShape({
      structuredData: template,
      draft,
      targetStatus: 'published',
    })

    expect(validationIssues).toEqual([])
  })
})
