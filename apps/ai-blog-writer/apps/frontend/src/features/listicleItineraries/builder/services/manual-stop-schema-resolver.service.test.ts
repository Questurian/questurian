import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  RelatedItemOption
} from '../../types'
import { resolveManualStopSchemaDetails } from './manual-stop-schema-resolver.service'

function buildManualStop(): ItineraryItemBlock {
  return {
    id: 'tour-stop',
    blockType: 'itinerary-tour-agency',
    item: null,
    tours: [],
    mediaMode: 'both',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: 'Sacred Valley Day Tour',
    operator: 'Andes Routes',
    price: '$$',
    url: 'https://example.com/tours/sacred-valley',
    tourDuration: 8,
    startingPoint: {
      label: 'Invalid starting point',
      latitude: '95',
      longitude: '-71.9675'
    },
    keyLocations: [
      {
        id: 'existing-location',
        source: 'existing',
        relatedCollection: 'attractions',
        relatedItem: 202,
        title: '',
        latitude: '',
        longitude: ''
      },
      {
        id: 'manual-location',
        source: 'manual',
        relatedCollection: null,
        relatedItem: null,
        title: 'Maras lookout',
        latitude: '-13.3283',
        longitude: '-72.1594'
      },
      {
        id: 'empty-location',
        source: 'manual',
        relatedCollection: null,
        relatedItem: null,
        title: '',
        latitude: '',
        longitude: ''
      }
    ],
    image: 501,
    instagramPost: 42,
    blurbMarkdown: 'A scenic full-day circuit through the Sacred Valley.',
    blurbJsonText: ''
  }
}

function buildRelatedByType(): Record<ItineraryBlockType, RelatedItemOption[]> {
  return {
    'itinerary-dining': [],
    'itinerary-accommodations': [],
    'itinerary-where-staying': [],
    'itinerary-attractions': [
      {
        id: 202,
        title: 'Pisac Archaeological Park',
        latitude: '-13.4084',
        longitude: '-71.8467'
      }
    ],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': []
  }
}

describe('resolveManualStopSchemaDetails', () => {
  it('resolves selected media and usable route entities while omitting invalid entries', () => {
    const details = resolveManualStopSchemaDetails({
      itineraryItem: buildManualStop(),
      mediaAssets: [
        {
          id: 501,
          filename: 'tour.jpg',
          url: 'https://example.com/media/tour.jpg'
        }
      ],
      instagramPosts: [
        {
          id: 42,
          title: 'Sacred Valley Reel',
          shortcode: 'ABC123'
        }
      ],
      relatedByBlockType: buildRelatedByType()
    })

    expect(details.imageUrl).toBe('https://example.com/media/tour.jpg')
    expect(details.instagramPermalink).toBe(
      'https://www.instagram.com/p/ABC123/'
    )
    expect(details.startingPoint).toBeUndefined()
    expect(details.keyLocations).toEqual([
      {
        '@type': 'Place',
        name: 'Pisac Archaeological Park',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -13.4084,
          longitude: -71.8467
        }
      },
      {
        '@type': 'Place',
        name: 'Maras lookout',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -13.3283,
          longitude: -72.1594
        }
      }
    ])
  })
})
