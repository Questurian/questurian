import { describe, expect, it } from 'vitest'
import {
  applySingleTypeListicleGeneratedContent,
  buildSingleTypeGenerateListicleContentRequest,
  getSingleTypeAutoWriteTargetIds,
  getSingleTypeIntroDisabledReason,
  getSingleTypeIntroTargetId,
} from './ai-autowrite.service'
import type { LocationOption, RelatedItemOption, SingleTypeListicleDraft } from '../../types'

function buildDraft(): SingleTypeListicleDraft {
  return {
    draftId: 'draft-1',
    editorModelName: 'gemini-2.5-flash',
    listTone: 'elevated',
    title: 'Best Restaurants in Lima',
    location: 'peru|lima|barranco',
    locationRef: 1,
    sharedNeighborhoods: [2],
    listicleType: 'dining',
    targetItemCount: 2,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    header: {
      introMarkdown: '',
      featuredImage: null,
    },
    items: [
      {
        id: 'item-1',
        blockType: 'data-dining',
        item: 101,
        tours: [],
        mediaMode: 'photos',
        selectedPhotos: [77],
        selectedInstagramPost: null,
        blurbMarkdown: '',
      },
      {
        id: 'item-2',
        blockType: 'data-dining',
        item: 102,
        tours: [],
        mediaMode: 'instagram',
        selectedPhotos: [],
        selectedInstagramPost: 33,
        blurbMarkdown: 'Keep this existing copy.',
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
    status: 'draft',
    articleType: 'single-type-listicle',
    updatedAt: '2026-03-30T12:00:00.000Z',
  }
}

function buildLocations(): LocationOption[] {
  return [
    {
      id: 1,
      locationKey: 'peru|lima|barranco',
      neighborhood: 'Barranco',
      city: 'Lima',
      country: 'Peru',
      level: 'neighborhood',
    },
    {
      id: 2,
      locationKey: 'peru|lima|miraflores',
      neighborhood: 'Miraflores',
      city: 'Lima',
      country: 'Peru',
      level: 'neighborhood',
    },
  ]
}

function buildRelatedItems(): RelatedItemOption[] {
  return [
    {
      id: 101,
      title: 'La Mar',
      location: 'Miraflores, Lima',
      idealFor: ['seafood lovers'],
      gallery: [],
      instagramGallery: [],
    },
    {
      id: 102,
      title: 'Mérito',
      location: 'Barranco, Lima',
      gallery: [],
      instagramGallery: [],
    },
  ]
}

describe('singleTypeListicles ai autowrite service', () => {
  it('builds a generation request for intro and blurbs with contextual research fields', () => {
    const draft = buildDraft()
    const introTargetId = getSingleTypeIntroTargetId(draft)
    const request = buildSingleTypeGenerateListicleContentRequest({
      draft,
      relatedItems: buildRelatedItems(),
      locations: buildLocations(),
      targetIds: [introTargetId, 'item-1_blurb'],
      modelName: 'gemini-2.5-flash',
      skipExisting: true,
    })

    expect(request.articleType).toBe('single-type-listicle')
    expect(request.locationLabel).toBe('Barranco, Lima, Peru (focus neighborhoods: Miraflores)')
    expect(request.articleContext).toContain('Selected source snapshot')
    expect(request.targets).toEqual([
      expect.objectContaining({
        targetId: introTargetId,
        fieldType: 'intro',
        category: 'dining',
        supportingContext: expect.stringContaining('Selected venues: La Mar, Mérito'),
      }),
      expect.objectContaining({
        targetId: 'item-1_blurb',
        fieldType: 'blurb',
        category: 'dining',
        displayName: 'La Mar',
        researchSubject: 'La Mar',
        locationLabel: 'Miraflores, Lima',
      }),
    ])
  })

  it('does not send whole article context for item-only blurb generation', () => {
    const draft = buildDraft()
    const request = buildSingleTypeGenerateListicleContentRequest({
      draft,
      relatedItems: buildRelatedItems(),
      locations: buildLocations(),
      targetIds: ['item-1_blurb'],
      modelName: 'gemini-2.5-flash',
    })

    expect(request.articleContext).toBeUndefined()
    expect(request.targets).toHaveLength(1)
    expect(request.targets[0]).toEqual(expect.objectContaining({
      targetId: 'item-1_blurb',
      fieldType: 'blurb',
    }))
  })

  it('returns only empty intro and blurbs for bulk auto-write', () => {
    const draft = buildDraft()

    expect(getSingleTypeAutoWriteTargetIds(draft, buildRelatedItems())).toEqual([
      getSingleTypeIntroTargetId(draft),
      'item-1_blurb',
    ])
  })

  it('does not include intro in bulk auto-write until every item is selected', () => {
    const draft = buildDraft()
    draft.items[1] = { ...draft.items[1]!, item: null }

    expect(getSingleTypeIntroDisabledReason(draft)).toBe('Select every item before writing intro')
    expect(getSingleTypeAutoWriteTargetIds(draft, buildRelatedItems())).toEqual([
      'item-1_blurb',
    ])
  })

  it('applies only generated fields back onto the draft', () => {
    const draft = buildDraft()
    const nextDraft = applySingleTypeListicleGeneratedContent(draft, {
      results: {
        [getSingleTypeIntroTargetId(draft)]: {
          target_id: getSingleTypeIntroTargetId(draft),
          status: 'generated',
          markdown: 'Fresh intro',
          model_used: 'gemini-2.5-flash',
          source_urls: ['https://example.com'],
          validation_errors: [],
        },
        'item-1_blurb': {
          target_id: 'item-1_blurb',
          status: 'generated',
          markdown: 'Fresh blurb',
          model_used: 'gemini-2.5-flash',
          source_urls: [],
          validation_errors: [],
        },
        item_2_blurb: {
          target_id: 'item-2_blurb',
          status: 'skipped',
          markdown: 'Keep this existing copy.',
          model_used: 'gemini-2.5-flash',
          source_urls: [],
          validation_errors: [],
        },
      },
    })

    expect(nextDraft.header.introMarkdown).toBe('Fresh intro')
    expect(nextDraft.items[0]?.blurbMarkdown).toBe('Fresh blurb')
    expect(nextDraft.items[1]?.blurbMarkdown).toBe('Keep this existing copy.')
  })
})
