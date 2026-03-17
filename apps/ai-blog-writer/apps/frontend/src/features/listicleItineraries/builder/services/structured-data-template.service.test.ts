import type { ListicleItineraryDraft, RelatedItemOption } from '../../types'
import {
  buildListicleItineraryStructuredDataTemplate,
  validateListicleItineraryStructuredDataShape,
} from './structured-data-template.service'

function buildDraft(): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    payloadStatus: 'published',
    payloadSlug: 'one-day-lima-itinerary',
    payloadPublishedAt: '2026-03-03T09:15:00.000Z',
    payloadUpdatedAt: '2026-03-03T10:30:00.000Z',
    payloadAuthorName: 'Alan Malpartida',
    editorModelName: 'gemini-2.5-flash',
    title: 'One Day Lima Itinerary',
    location: 'Peru|Lima|Barranco',
    locationRef: 1,
    sharedNeighborhoods: [],
    dayAudience: 'anyday',
    itineraryStartHour: 9,
    itineraryStartMinute: '00',
    itineraryStartPeriod: 'AM',
    itineraryEndHour: 6,
    itineraryEndMinute: '00',
    itineraryEndPeriod: 'PM',
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: true,
    step3_in_update_mode: false,
    header: {
      introMarkdown: 'Discover an unforgettable day in Lima with this long intro that should still be normalized for structured data.',
      introJsonText: '',
      featuredImage: null,
    },
    items: [
      {
        id: 'item-1',
        blockType: 'itinerary-dining',
        item: 101,
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        timeHour: 9,
        timeMinute: '00',
        timePeriod: 'AM',
        durationHours: 1,
        durationMinutes: '0',
        blurbMarkdown: 'Discover a top brunch stop in Barranco.',
        blurbJsonText: '',
      },
      {
        id: 'item-2',
        blockType: 'itinerary-attractions',
        item: 202,
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        timeHour: 11,
        timeMinute: '00',
        timePeriod: 'AM',
        durationHours: 2,
        durationMinutes: '0',
        blurbMarkdown: 'Explore iconic views and cultural highlights.',
        blurbJsonText: '',
      },
    ],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: {
        title: '',
        description: '',
        imageUrl: 'https://example.com/itinerary-og.jpg',
        url: 'https://example.com/one-day-lima-itinerary',
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
    status: 'published',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-03-03T10:00:00.000Z',
  }
}

function buildRelatedByType(): Record<ListicleItineraryDraft['items'][number]['blockType'], RelatedItemOption[]> {
  return {
    'itinerary-dining': [{ id: 101, title: 'Brunch Spot' }],
    'itinerary-accommodations': [],
    'itinerary-attractions': [{ id: 202, title: 'Scenic Mirador' }],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
  }
}

describe('listicleItineraries structured data template', () => {
  it('builds valid published structured data with trip metadata', () => {
    const draft = buildDraft()
    const structuredData = buildListicleItineraryStructuredDataTemplate({
      draft,
      relatedByBlockType: buildRelatedByType(),
      publisherConfig: {
        siteName: 'Questurian',
        logoUrl: 'https://example.com/logo.png',
        defaultAuthorName: 'Questurian Team',
      },
    })

    const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
    const blogPostingNode = graph.find((node) => (
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'BlogPosting'
    )) as Record<string, unknown> | undefined
    const tripNode = graph.find((node) => (
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'Trip'
    )) as Record<string, unknown> | undefined
    const itemListNode = graph.find((node) => (
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'ItemList'
    )) as Record<string, unknown> | undefined

    expect(blogPostingNode).toBeTruthy()
    expect(tripNode).toBeTruthy()
    expect(itemListNode).toBeTruthy()
    expect(tripNode?.departureTime).toBe('2026-03-03T09:00:00')
    expect(tripNode?.arrivalTime).toBe('2026-03-03T18:00:00')
    expect(blogPostingNode?.['@id']).toBe(
      'https://example.com/one-day-lima-itinerary#listicle-itinerary-blog-posting',
    )
    expect(blogPostingNode?.datePublished).toBe('2026-03-03T09:15:00.000Z')
    expect(blogPostingNode?.dateModified).toBe('2026-03-03T10:30:00.000Z')

    const author = (blogPostingNode?.author && typeof blogPostingNode.author === 'object')
      ? blogPostingNode.author as Record<string, unknown>
      : undefined
    expect(author?.name).toBe('Alan Malpartida')

    const publisher = (blogPostingNode?.publisher && typeof blogPostingNode.publisher === 'object')
      ? blogPostingNode.publisher as Record<string, unknown>
      : undefined
    expect(publisher?.name).toBe('Questurian')

    const contentLocation = (blogPostingNode?.contentLocation && typeof blogPostingNode.contentLocation === 'object')
      ? blogPostingNode.contentLocation as Record<string, unknown>
      : undefined
    expect(contentLocation?.name).toBe('Barranco, Lima, Peru')

    const mainEntityOfPage = (blogPostingNode?.mainEntityOfPage && typeof blogPostingNode.mainEntityOfPage === 'object')
      ? blogPostingNode.mainEntityOfPage as Record<string, unknown>
      : undefined
    expect(mainEntityOfPage?.['@id']).toBe('https://example.com/one-day-lima-itinerary')

    const itemListElement = Array.isArray(itemListNode?.itemListElement) ? itemListNode.itemListElement : []
    const firstListItem = itemListElement[0] as Record<string, unknown> | undefined
    const secondListItem = itemListElement[1] as Record<string, unknown> | undefined
    const firstEntity = (firstListItem?.item && typeof firstListItem.item === 'object')
      ? firstListItem.item as Record<string, unknown>
      : undefined
    const secondEntity = (secondListItem?.item && typeof secondListItem.item === 'object')
      ? secondListItem.item as Record<string, unknown>
      : undefined

    expect(firstEntity?.['@type']).toBe('Restaurant')
    expect(secondEntity?.['@type']).toBe('TouristAttraction')

    const shapeIssues = validateListicleItineraryStructuredDataShape({
      structuredData,
      draft,
    })
    expect(shapeIssues).toEqual([])
  })
})
