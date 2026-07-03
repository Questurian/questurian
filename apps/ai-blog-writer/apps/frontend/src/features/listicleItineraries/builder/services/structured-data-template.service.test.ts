import type {
  InstagramPostOption,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  MediaAssetOption,
  RelatedItemOption,
} from '../../types'
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
    dayCount: 1,
    days: [
      {
        id: 'day_1',
        whereStaying: [],
        items: [
          {
            id: 'item-1',
            blockType: 'itinerary-dining',
            item: 101,
            tours: [],
            mediaMode: 'photos',
            selectedPhotos: [],
            selectedInstagramPost: null,
            title: '',
            operator: '',
            price: '',
            url: '',
            tourDuration: 1,
            startingPoint: {
              label: '',
              latitude: '',
              longitude: '',
            },
            keyLocations: [],
            image: null,
            instagramPost: null,
            blurbMarkdown: 'Discover a top brunch stop in Barranco.',
            blurbJsonText: '',
          },
          {
            id: 'item-2',
            blockType: 'itinerary-attractions',
            item: 202,
            tours: [],
            mediaMode: 'photos',
            selectedPhotos: [],
            selectedInstagramPost: null,
            title: '',
            operator: '',
            price: '',
            url: '',
            tourDuration: 1,
            startingPoint: {
              label: '',
              latitude: '',
              longitude: '',
            },
            keyLocations: [],
            image: null,
            instagramPost: null,
            blurbMarkdown: 'Explore iconic views and cultural highlights.',
            blurbJsonText: '',
          },
        ],
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

function buildRelatedByType(): Record<ItineraryItemBlock['blockType'], RelatedItemOption[]> {
  return {
    'itinerary-dining': [{ id: 101, title: 'Brunch Spot' }],
    'itinerary-accommodations': [],
    'itinerary-where-staying': [],
    'itinerary-attractions': [{ id: 202, title: 'Scenic Mirador' }],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': [],
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
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'TouristTrip'
    )) as Record<string, unknown> | undefined
    const itemListNode = graph.find((node) => (
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'ItemList'
    )) as Record<string, unknown> | undefined

    expect(blogPostingNode).toBeTruthy()
    expect(tripNode).toBeTruthy()
    expect(itemListNode).toBeTruthy()
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
    expect(firstEntity?.category).toBeUndefined()
    expect(typeof firstEntity?.keywords === 'string' ? firstEntity.keywords : '').toContain('Dining')
    expect(blogPostingNode?.inLanguage).toBe('en')

    const shapeIssues = validateListicleItineraryStructuredDataShape({
      structuredData,
      draft,
    })
    expect(shapeIssues).toEqual([])
  })

  it('serializes manual tour-agency key locations and instagram permalink', () => {
    const draft = buildDraft()
    draft.days = [{
      ...draft.days[0],
      items: [
      {
        id: 'tour-stop',
        blockType: 'itinerary-tour-agency',
        item: null,
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [],
        selectedInstagramPost: null,
        title: 'Sacred Valley Day Tour',
        operator: 'Andes Routes',
        price: '$$',
        url: 'https://example.com/tours/sacred-valley',
        tourDuration: 8,
        startingPoint: {
          label: 'Cusco Historic Center',
          latitude: '-13.5319',
          longitude: '-71.9675',
        },
        keyLocations: [
          {
            id: 'row-1',
            source: 'existing',
            relatedCollection: 'attractions',
            relatedItem: 202,
            title: '',
            latitude: '',
            longitude: '',
          },
          {
            id: 'row-2',
            source: 'manual',
            relatedCollection: null,
            relatedItem: null,
            title: 'Maras lookout',
            latitude: '-13.3283',
            longitude: '-72.1594',
          },
        ],
        image: 501,
        instagramPost: 42,
        blurbMarkdown: 'A scenic full-day circuit through the Sacred Valley.',
        blurbJsonText: '',
      },
    ],
    }]

    const mediaAssets: MediaAssetOption[] = [
      {
        id: 501,
        filename: 'tour.jpg',
        url: 'https://example.com/media/tour.jpg',
      },
    ]
    const instagramPosts: InstagramPostOption[] = [
      {
        id: 42,
        title: 'Sacred Valley Reel',
        embedCode: '<blockquote data-instgrm-permalink="https://www.instagram.com/p/ABC123/"></blockquote>',
      },
    ]

    const structuredData = buildListicleItineraryStructuredDataTemplate({
      draft,
      relatedByBlockType: buildRelatedByType(),
      mediaAssets,
      instagramPosts,
      publisherConfig: {
        siteName: 'Questurian',
        logoUrl: 'https://example.com/logo.png',
        defaultAuthorName: 'Questurian Team',
      },
    })

    const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
    const itemListNode = graph.find((node) => (
      node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'ItemList'
    )) as Record<string, unknown> | undefined
    const itemListElement = Array.isArray(itemListNode?.itemListElement) ? itemListNode.itemListElement : []
    const manualStop = itemListElement[0] as Record<string, unknown> | undefined
    const manualStopEntity = manualStop?.item as Record<string, unknown> | undefined
    const itinerary = manualStopEntity?.itinerary as Record<string, unknown> | undefined
    const itineraryStops = Array.isArray(itinerary?.itemListElement) ? itinerary.itemListElement : []
    const secondRoutePoint = itineraryStops[1] as Record<string, unknown> | undefined
    const secondRoutePlace = secondRoutePoint?.item as Record<string, unknown> | undefined
    const secondRouteGeo = secondRoutePlace?.geo as Record<string, unknown> | undefined
    const departureLocation = manualStopEntity?.departureLocation as Record<string, unknown> | undefined
    const departureGeo = departureLocation?.geo as Record<string, unknown> | undefined

    expect(manualStopEntity?.sameAs).toEqual(['https://www.instagram.com/p/ABC123/'])
    expect(manualStopEntity?.image).toBe('https://example.com/media/tour.jpg')
    expect(manualStopEntity?.priceRange).toBe('$$')
    expect(departureLocation?.name).toBe('Cusco Historic Center')
    expect(departureGeo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: -13.5319,
      longitude: -71.9675,
    })
    expect(itineraryStops).toHaveLength(2)
    expect(secondRoutePlace?.name).toBe('Maras lookout')
    expect(secondRouteGeo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: -13.3283,
      longitude: -72.1594,
    })
  })
})
