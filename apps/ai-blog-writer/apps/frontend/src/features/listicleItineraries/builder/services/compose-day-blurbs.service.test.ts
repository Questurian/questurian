import { describe, expect, it } from 'vitest'
import { buildItineraryComposeDayBlurbsRequest } from './compose-day-blurbs.service'
import {
  dayHasExistingBlurbs,
  getComposableDayIndexes,
  getItineraryDayBlurbComposeDisabledReason,
  getItineraryStopBlurbComposeDisabledReason,
  isDayBlurbsFullyComposed,
  itineraryStopBlurbWriteStrandsNeighbor,
} from './day-blurb-readiness.service'
import {
  applyItineraryComposedDayBlurbs,
  buildFailedDayBlurbComposeReport,
} from './day-blurb-results.service'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import type { ComposeDayBlurbsResponse } from '../../../staging/api'

function buildItem(overrides: Partial<ItineraryItemBlock> & { id: string }): ItineraryItemBlock {
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

function buildDraft(overrides: Partial<ListicleItineraryDraft> = {}): ListicleItineraryDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'claude-opus-4-8',
    listTone: 'elevated',
    title: 'Two Days in Lima',
    location: 'peru|lima',
    locationRef: 1,
    sharedNeighborhoods: [],
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: { introMarkdown: 'A two-day Lima opener.', featuredImage: null },
    dayCount: 2,
    planOverview: 'A two-day Barranco-anchored foodie trip.',
    days: [
      {
        id: 'day_1',
        whereStaying: [
          buildItem({
            id: 'ws-1',
            blockType: 'itinerary-where-staying',
            item: 10,
            angle: 'location-and-setting',
            selectionReason: 'central, comfortable',
          }),
        ],
        items: [
          buildItem({
            id: 'stop-1',
            blockType: 'itinerary-dining',
            item: 202,
            angle: 'signature-dish',
            selectionReason: 'tasting-menu fine dining',
          }),
          // Unresolved related slot — skipped.
          buildItem({ id: 'stop-x', blockType: 'itinerary-attractions', item: null }),
        ],
      },
      {
        id: 'day_2',
        whereStaying: [],
        items: [
          buildItem({
            id: 'stop-2',
            blockType: 'itinerary-attractions',
            item: 303,
            angle: 'signature-feature',
            selectionReason: 'iconic pre-Columbian museum',
          }),
        ],
      },
    ],
    seoSection: {
      seoTitle: '',
      metaDescription: '',
      openGraph: { title: '', description: '', imageUrl: '', url: '' },
      twitterCard: { card: 'summary_large_image', title: '', description: '', imageUrl: '' },
      structuredData: '',
      robots: { index: 'index', follow: 'follow' },
    },
    status: 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: '2026-06-13T12:00:00.000Z',
    ...overrides,
  }
}

function buildLocations(): LocationOption[] {
  return [{ id: 1, locationKey: 'peru|lima', city: 'Lima', country: 'Peru', level: 'city' }]
}

function buildRelatedByBlockType(): Record<ItineraryBlockType, RelatedItemOption[]> {
  return {
    'itinerary-dining': [
      { id: 202, title: 'Mérito', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-accommodations': [
      { id: 10, title: 'Grand Hotel', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-where-staying': [
      { id: 10, title: 'Grand Hotel', location: 'Barranco, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-attractions': [
      { id: 303, title: 'Museo Larco', location: 'Pueblo Libre, Lima', gallery: [], instagramGallery: [] },
    ],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': [],
  }
}

describe('day-blurb composer service', () => {
  it('captures failed requests for the inspector report', () => {
    expect(buildFailedDayBlurbComposeReport({
      modelName: 'claude-sonnet-5',
      errorMessage: 'provider overloaded',
      durationMs: 1234,
    })).toEqual({
      model_used: 'claude-sonnet-5',
      results: {},
      steps: [{
        name: 'request',
        label: 'Day composer request',
        status: 'failed',
        duration_ms: 1234,
        model: 'claude-sonnet-5',
        details: { error: 'provider overloaded' },
      }],
    })
  })

  it('is ready when intro is locked, stops resolve, and pooled stops have angles', () => {
    expect(
      getItineraryDayBlurbComposeDisabledReason(buildDraft(), 0, buildRelatedByBlockType()),
    ).toBeUndefined()
  })

  it('does not gate day composition on intro content or Step 2 lock state', () => {
    const related = buildRelatedByBlockType()
    expect(
      getItineraryDayBlurbComposeDisabledReason(buildDraft({ step2_in_update_mode: true }), 0, related),
    ).toBeUndefined()
    expect(
      getItineraryDayBlurbComposeDisabledReason(
        buildDraft({ header: { introMarkdown: '   ', featuredImage: null } }),
        0,
        related,
      ),
    ).toBeUndefined()
  })

  it('gates on a missing angle for a pooled-category stop (ADR 0010)', () => {
    const draft = buildDraft()
    draft.days[0].items[0].angle = null
    expect(getItineraryDayBlurbComposeDisabledReason(draft, 0, buildRelatedByBlockType())).toBe(
      'Day 1: select a blurb angle for "Mérito"',
    )
  })

  it('gates on a missing Selection reason for a resolved stop (ADR 0020)', () => {
    const draft = buildDraft()
    draft.days[0].items[0].selectionReason = ''
    expect(getItineraryDayBlurbComposeDisabledReason(draft, 0, buildRelatedByBlockType())).toBe(
      'Day 1: add a "Why this pick" for "Mérito"',
    )
  })

  it('gates on having at least one resolved stop', () => {
    const draft = buildDraft({
      days: [
        { id: 'day_1', whereStaying: [], items: [buildItem({ id: 's', item: null })] },
        { id: 'day_2', whereStaying: [], items: [] },
      ],
    })
    expect(getItineraryDayBlurbComposeDisabledReason(draft, 0, buildRelatedByBlockType())).toBe(
      'Day 1: add at least one resolved stop before composing blurbs',
    )
  })

  it('builds the request with intro framing, day label, ordered stops, and the next-day edge', () => {
    const request = buildItineraryComposeDayBlurbsRequest({
      draft: buildDraft(),
      dayIndex: 0,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
    })

    expect(request.articleTitle).toBe('Two Days in Lima')
    expect(request.locationLabel).toBe('Lima, Peru')
    expect(request.intro).toBe('A two-day Lima opener.')
    expect(request.dayLabel).toBe('Day 1')
    expect(request.dayCount).toBe(2)
    expect(request.prevDayLastStop).toBeUndefined()
    expect(request.nextDayFirstStop).toEqual({ title: 'Museo Larco', category: 'Attractions' })
    expect(request.stops.map((s) => s.targetId)).toEqual(['ws-1_blurb', 'stop-1_blurb'])
    expect(request.stops[1]).toMatchObject({ title: 'Mérito', category: 'Dining', angle: 'signature-dish' })
  })

  it('passes the previous-day edge stop to a middle/last day', () => {
    const request = buildItineraryComposeDayBlurbsRequest({
      draft: buildDraft(),
      dayIndex: 1,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
    })
    expect(request.prevDayLastStop).toEqual({ title: 'Mérito', category: 'Dining' })
    expect(request.nextDayFirstStop).toBeUndefined()
  })

  it('resolves a manual tour stop from its title before falling back to its operator', () => {
    const draft = buildDraft({
      dayCount: 1,
      days: [{
        id: 'day_1',
        whereStaying: [],
        items: [
          buildItem({
            id: 'tour-1',
            blockType: 'itinerary-tour-agency',
            title: '  Sunset Coast Tour  ',
            operator: 'Fallback Operator',
            selectionReason: 'coastal sunset route',
          }),
          buildItem({
            id: 'tour-2',
            blockType: 'itinerary-tour-agency',
            operator: '  Lima Night Walks  ',
            selectionReason: 'after-dark city route',
          }),
        ],
      }],
    })

    const request = buildItineraryComposeDayBlurbsRequest({
      draft,
      dayIndex: 0,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
    })

    expect(request.stops.map(({ title, category }) => ({ title, category }))).toEqual([
      { title: 'Sunset Coast Tour', category: 'Tour Agency' },
      { title: 'Lima Night Walks', category: 'Tour Agency' },
    ])
  })

  it('applies only generated blurbs, only to the target day', () => {
    const response: ComposeDayBlurbsResponse = {
      model_used: 'claude-opus-4-8',
      results: {
        'stop-1_blurb': { target_id: 'stop-1_blurb', status: 'generated', markdown: 'Fresh dining prose.', validation_errors: [] },
        'ws-1_blurb': { target_id: 'ws-1_blurb', status: 'error', validation_errors: ['missing'] },
      },
      steps: [],
    }
    const next = applyItineraryComposedDayBlurbs(buildDraft(), 0, response)

    expect(next.days[0].items[0].blurbMarkdown).toBe('Fresh dining prose.')
    expect(next.days[0].items[0].blurbJsonText).toBe('')
    expect(next.days[0].whereStaying[0].blurbMarkdown).toBe('') // error result left untouched
    expect(next.days[1].items[0].blurbMarkdown).toBe('') // other day untouched
  })

  it('carries each stop\'s existing blurb and threads writeTargetIds through (ADR 0022)', () => {
    const draft = buildDraft()
    draft.days[0].items[0].blurbMarkdown = 'Existing dining prose.'

    const request = buildItineraryComposeDayBlurbsRequest({
      draft,
      dayIndex: 0,
      relatedByBlockType: buildRelatedByBlockType(),
      locations: buildLocations(),
      modelName: 'claude-opus-4-8',
      writeTargetIds: ['ws-1_blurb'],
    })

    expect(request.writeTargetIds).toEqual(['ws-1_blurb'])
    const dining = request.stops.find((s) => s.targetId === 'stop-1_blurb')
    expect(dining?.existingBlurb).toBe('Existing dining prose.')
    // An unwritten stop sends no existing copy.
    const lodging = request.stops.find((s) => s.targetId === 'ws-1_blurb')
    expect(lodging?.existingBlurb).toBeUndefined()
  })

  describe('single-stop compose gate (ADR 0022)', () => {
    it('is ready for a resolved stop with an angle and a reason under a locked intro', () => {
      const draft = buildDraft()
      expect(
        getItineraryStopBlurbComposeDisabledReason(draft.days[0].items[0], buildRelatedByBlockType()),
      ).toBeUndefined()
    })

    it('gates on this stop\'s angle and reason, not siblings', () => {
      const related = buildRelatedByBlockType()

      const noAngle = buildDraft()
      noAngle.days[0].items[0].angle = null
      expect(
        getItineraryStopBlurbComposeDisabledReason(noAngle.days[0].items[0], related),
      ).toBe('Select a blurb angle for "Mérito"')

      const noReason = buildDraft()
      noReason.days[0].items[0].selectionReason = ''
      expect(
        getItineraryStopBlurbComposeDisabledReason(noReason.days[0].items[0], related),
      ).toBe('Add a "Why this pick" for "Mérito"')

      // A sibling missing its angle/reason does NOT block this stop (it rides as context).
      const siblingBroken = buildDraft()
      siblingBroken.days[0].whereStaying[0].selectionReason = ''
      expect(
        getItineraryStopBlurbComposeDisabledReason(siblingBroken.days[0].items[0], related),
      ).toBeUndefined()
    })

    it('gates on resolving this stop', () => {
      const unresolved = buildItem({ id: 'fresh', blockType: 'itinerary-attractions', item: null })
      expect(
        getItineraryStopBlurbComposeDisabledReason(unresolved, buildRelatedByBlockType()),
      ).toBe('Resolve this stop (pick or name it) before composing its blurb')
    })
  })

  describe('stale-neighbor detection (ADR 0022)', () => {
    it('does not flag a stop appended at the day\'s end', () => {
      const draft = buildDraft()
      draft.days[0].whereStaying[0].blurbMarkdown = 'lodging copy'
      // stop-1 is the last resolved stop in day 1's article order.
      expect(
        itineraryStopBlurbWriteStrandsNeighbor(draft, 0, 'stop-1', buildRelatedByBlockType()),
      ).toBe(false)
    })

    it('flags a non-last stop when another stop in the day is already written', () => {
      const draft = buildDraft()
      draft.days[0].items[0].blurbMarkdown = 'dining copy already written'
      // ws-1 sits before the written dining stop → its handoff can go stale.
      expect(
        itineraryStopBlurbWriteStrandsNeighbor(draft, 0, 'ws-1', buildRelatedByBlockType()),
      ).toBe(true)
    })

    it('does not flag a non-last stop when no sibling has a blurb yet', () => {
      const draft = buildDraft()
      expect(
        itineraryStopBlurbWriteStrandsNeighbor(draft, 0, 'ws-1', buildRelatedByBlockType()),
      ).toBe(false)
    })
  })

  it('detects existing/fully-composed days and lists composable indexes', () => {
    const related = buildRelatedByBlockType()
    const fresh = buildDraft()
    expect(dayHasExistingBlurbs(fresh, 0, related)).toBe(false)
    expect(isDayBlurbsFullyComposed(fresh, 0, related)).toBe(false)
    expect(getComposableDayIndexes(fresh, related)).toEqual([0, 1])

    const day0Done = buildDraft()
    day0Done.days[0].whereStaying[0].blurbMarkdown = 'lodging copy'
    day0Done.days[0].items[0].blurbMarkdown = 'dining copy'
    expect(isDayBlurbsFullyComposed(day0Done, 0, related)).toBe(true)
    expect(dayHasExistingBlurbs(day0Done, 0, related)).toBe(true)
    // Fully-composed day 0 is auto-skipped by "write all"; day 1 remains.
    expect(getComposableDayIndexes(day0Done, related)).toEqual([1])
  })
})
