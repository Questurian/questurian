import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'

/** Shared test doubles for the Fill-In Ideas prompt and its gate. */

export function buildFillItem(
  overrides: Partial<ItineraryItemBlock> & { id: string },
): ItineraryItemBlock {
  return {
    blockType: 'itinerary-dining',
    item: null,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: '',
    operator: '',
    price: '',
    url: '',
    tourDuration: 1,
    startingPoint: { label: '', latitude: '', longitude: '' },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: '',
    ...overrides,
  }
}

/** A lodging row pointing at accommodation record 99 ("Hotel B"). */
export const lodgingRow = buildFillItem({
  id: 'lodge_1',
  blockType: 'itinerary-where-staying',
  item: 99,
})

export function buildFillDraft(
  overrides: Partial<ListicleItineraryDraft> = {},
): ListicleItineraryDraft {
  return {
    draftId: 'lit_test',
    editorModelName: 'gemini-2.5-flash' as ListicleItineraryDraft['editorModelName'],
    listTone: 'friendly-expert' as ListicleItineraryDraft['listTone'],
    title: 'Three Days in Lima',
    location: 'peru|lima|miraflores',
    locationRef: null,
    sharedNeighborhoods: [],
    step1_complete: true,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: { introMarkdown: '', introJsonText: '', featuredImage: null },
    dayCount: 1,
    days: [{ id: 'day_0', whereStaying: [lodgingRow], items: [] }],
    dayShellSelections: [{ dayId: 'day_0', shellId: 'rich_standard_day' }],
    fillIdeaRuns: [],
    seoSection: {} as ListicleItineraryDraft['seoSection'],
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  }
}

export const relatedWithHotels = {
  'itinerary-dining': [
    { id: 7, title: 'Isolina' },
    { id: 8, title: 'Maido' },
  ],
  'itinerary-where-staying': [
    { id: 99, title: 'Hotel B' },
    { id: 100, title: 'Hostal Barranco' },
  ],
} as unknown as Record<ItineraryBlockType, RelatedItemOption[]>

export const fillLocations = [
  {
    id: 1,
    locationKey: 'peru|lima|miraflores',
    country: 'Peru',
    city: 'Lima',
    neighborhood: 'Miraflores',
  },
] as unknown as LocationOption[]

/** Build N days, each shell-selected, the first carrying the lodging row. */
export function buildDays(count: number, items: ItineraryItemBlock[] = []) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `day_${index}`,
    whereStaying: index === 0 ? [lodgingRow] : [],
    items: items.map((item) => ({ ...item, id: `${item.id}_d${index}` })),
  }))
}

export function buildShellSelections(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    dayId: `day_${index}`,
    shellId: 'rich_standard_day',
  }))
}
