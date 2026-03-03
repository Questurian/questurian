import type { ListicleItineraryDraft, RelatedItemOption } from '../../types'
import {
  buildListicleItineraryStructuredDataTemplate,
  validateListicleItineraryStructuredDataShape,
} from './structured-data-template.service'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

function buildDraft(): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'gemini-2.5-flash',
    title: 'One Day Lima Itinerary',
    location: 'Lima|Lima|Barranco',
    locationRef: 1,
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
        imageUrl: '',
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

function run() {
  const draft = buildDraft()
  const structuredData = buildListicleItineraryStructuredDataTemplate({
    draft,
    relatedByBlockType: buildRelatedByType(),
  })

  const graph = Array.isArray(structuredData['@graph']) ? structuredData['@graph'] : []
  const tripNode = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'Trip'
  )) as Record<string, unknown> | undefined
  const itemListNode = graph.find((node) => (
    node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'ItemList'
  )) as Record<string, unknown> | undefined

  assert(Boolean(tripNode), 'Expected Trip node in @graph.')
  assert(Boolean(itemListNode), 'Expected ItemList node in @graph.')
  assert(tripNode?.departureTime === '2026-03-03T09:00:00', 'Expected Trip departureTime from itinerary start.')
  assert(tripNode?.arrivalTime === '2026-03-03T18:00:00', 'Expected Trip arrivalTime from itinerary end.')

  const itemListElement = Array.isArray(itemListNode?.itemListElement) ? itemListNode.itemListElement : []
  const firstListItem = itemListElement[0] as Record<string, unknown> | undefined
  const secondListItem = itemListElement[1] as Record<string, unknown> | undefined
  const firstEntity = (firstListItem?.item && typeof firstListItem.item === 'object')
    ? firstListItem.item as Record<string, unknown>
    : undefined
  const secondEntity = (secondListItem?.item && typeof secondListItem.item === 'object')
    ? secondListItem.item as Record<string, unknown>
    : undefined

  assert(firstEntity?.['@type'] === 'Restaurant', 'Expected dining stop mapped to Restaurant.')
  assert(secondEntity?.['@type'] === 'TouristAttraction', 'Expected attraction stop mapped to TouristAttraction.')

  const shapeIssues = validateListicleItineraryStructuredDataShape({
    structuredData,
    draft,
  })
  assert(shapeIssues.length === 0, `Expected no shape issues, received: ${shapeIssues.join('; ')}`)
}

run()
