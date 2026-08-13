import { describe, expect, it, vi } from 'vitest'
import type { Location, MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import {
  type EditorialPublishLifecycle,
  type EditorialStagePublishWorkflowParams,
  runEditorialStagePublishWorkflow
} from './editorial-stage-publish-workflow.service'

const location: Location = {
  id: 7,
  level: 'neighborhood',
  country: 'Peru',
  city: 'Lima',
  neighborhood: 'Barranco',
  countryName: 'Peru',
  cityName: 'Lima',
  neighborhoodName: 'Barranco',
  locationKey: 'peru/lima/barranco',
  updatedAt: '2026-03-01T00:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z'
}

const featuredImage: MediaAsset = {
  id: 99,
  filename: 'featured.webp',
  variant: 'hero'
}

const publishAnalysis: EditorialPublishAnalysis = {
  byId: {},
  blockingBlocks: [],
  hasBlockingBlocks: false
}

function buildStagedArticle(
  overrides: Partial<StagedArticle> = {}
): StagedArticle {
  return {
    id: 'draft-1',
    runId: 'run-1',
    originalTitle: 'Original title',
    originalContent: 'Original content',
    originalType: 'Guide',
    title: '  Barranco guide  ',
    content: 'A useful guide.',
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        content: 'A useful guide.'
      }
    ],
    editorialBlocks: [],
    locationId: location.id,
    sharedNeighborhoods: [],
    featuredImageId: 12,
    seoSection: {
      seoTitle: 'Barranco travel guide',
      metaDescription: 'A useful guide to Barranco.',
      openGraph: {
        title: 'Barranco travel guide',
        description: 'A useful guide to Barranco.',
        imageUrl: 'https://example.com/barranco.jpg',
        url: 'https://example.com/barranco'
      },
      twitterCard: {
        card: 'summary_large_image',
        title: 'Barranco travel guide',
        description: 'A useful guide to Barranco.',
        imageUrl: 'https://example.com/barranco.jpg'
      },
      structuredData: '',
      robots: {
        index: 'index',
        follow: 'follow'
      }
    },
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides
  }
}

function buildLifecycle(events: string[]): EditorialPublishLifecycle {
  return {
    request: () => events.push('request'),
    converting: () => events.push('converting'),
    submitting: () => events.push('submitting'),
    succeed: (message) => events.push(`success:${message}`),
    fail: (message) => events.push(`failure:${message}`)
  }
}

function buildWorkflowParams(
  overrides: Partial<EditorialStagePublishWorkflowParams> = {}
): EditorialStagePublishWorkflowParams {
  const events: string[] = []

  return {
    sourceFeature: 'url2blog',
    targetStatus: 'draft',
    stagedArticle: buildStagedArticle(),
    locations: [location],
    mediaAssets: [featuredImage],
    timelineItems: [
      {
        id: 'content:text-1',
        type: 'content',
        contentBlockId: 'text-1'
      }
    ],
    editorialPublishAnalysis: publishAnalysis,
    publisherConfig: {
      siteName: 'Questurian',
      defaultAuthorName: 'Questurian Editor'
    },
    convertMarkdownToLexical: vi.fn().mockResolvedValue({
      success: true,
      data: { root: { children: [] } }
    }),
    createArticle: vi.fn().mockResolvedValue({
      id: 42,
      status: 'draft',
      slug: 'barranco-guide',
      updatedAt: '2026-03-02T00:00:00.000Z'
    }),
    updateArticle: vi.fn(),
    markArticleSynced: vi.fn().mockResolvedValue({
      message: 'synced',
      run_id: 'run-1',
      payload_article_id: 42
    }),
    findPreferredVariantAsset: vi.fn().mockReturnValue(featuredImage),
    updateStagedArticle: vi.fn(),
    lifecycle: buildLifecycle(events),
    ...overrides
  }
}

describe('runEditorialStagePublishWorkflow', () => {
  it('stops at validation and reports the validation phase failure', async () => {
    const events: string[] = []
    const params = buildWorkflowParams({
      stagedArticle: buildStagedArticle({ title: '  ' }),
      lifecycle: buildLifecycle(events)
    })

    await runEditorialStagePublishWorkflow(params)

    expect(events).toEqual(['request', 'failure:Please enter an article title'])
    expect(params.convertMarkdownToLexical).not.toHaveBeenCalled()
    expect(params.createArticle).not.toHaveBeenCalled()
  })

  it('runs conversion, persistence, Sync bookkeeping, and UI success in order', async () => {
    const events: string[] = []
    const params = buildWorkflowParams({
      lifecycle: buildLifecycle(events)
    })

    await runEditorialStagePublishWorkflow(params)

    expect(events).toEqual([
      'request',
      'converting',
      'submitting',
      'success:Saved draft article #42'
    ])
    expect(params.convertMarkdownToLexical).toHaveBeenCalledWith(
      'A useful guide.'
    )
    expect(params.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Barranco guide',
        location: 'peru/lima/barranco',
        locationRef: 7,
        status: 'draft',
        sourceFeature: 'url2blog',
        sourceRunId: 'run-1',
        headerSection: { featuredImage: 99 }
      }),
    )
    expect(params.markArticleSynced).toHaveBeenCalledWith('run-1', 42)
    expect(params.updateStagedArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadArticleId: 42,
        payloadStatus: 'draft',
        payloadSlug: 'barranco-guide',
        lexicalConverted: true,
        hasUnsyncedPayloadChanges: false
      })
    )
  })

  it('reports conversion errors without entering persistence', async () => {
    const events: string[] = []
    const params = buildWorkflowParams({
      lifecycle: buildLifecycle(events),
      convertMarkdownToLexical: vi.fn().mockResolvedValue({
        success: false,
        error: 'Converter unavailable'
      })
    })

    await runEditorialStagePublishWorkflow(params)

    expect(events).toEqual([
      'request',
      'converting',
      'failure:Converter unavailable'
    ])
    expect(params.createArticle).not.toHaveBeenCalled()
    expect(params.updateStagedArticle).not.toHaveBeenCalled()
  })

  it('reports Payload failures after entering the submitting phase', async () => {
    const events: string[] = []
    const params = buildWorkflowParams({
      lifecycle: buildLifecycle(events),
      createArticle: vi
        .fn()
        .mockRejectedValue(new Error('Payload rejected the article'))
    })

    await runEditorialStagePublishWorkflow(params)

    expect(events).toEqual([
      'request',
      'converting',
      'submitting',
      'failure:Payload rejected the article'
    ])
    expect(params.markArticleSynced).not.toHaveBeenCalled()
    expect(params.updateStagedArticle).not.toHaveBeenCalled()
  })

  it('keeps a successful Payload save successful when local Sync bookkeeping fails', async () => {
    const events: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const params = buildWorkflowParams({
      lifecycle: buildLifecycle(events),
      markArticleSynced: vi.fn().mockRejectedValue(new Error('Run row missing'))
    })

    await runEditorialStagePublishWorkflow(params)

    expect(events.at(-1)).toBe(
      'success:Saved draft article #42 (local run record missing, sync status not recorded)'
    )
    expect(params.updateStagedArticle).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('refreshes published structured data with persisted metadata before local Sync', async () => {
    const events: string[] = []
    const publishedArticle = {
      id: 42,
      status: 'published',
      slug: 'barranco-guide',
      publishedAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      author: {
        slug: 'jane-doe',
        displayName: 'Jane Doe'
      }
    } as const
    const updateArticle = vi.fn().mockResolvedValue(publishedArticle)
    const params = buildWorkflowParams({
      targetStatus: 'published',
      lifecycle: buildLifecycle(events),
      createArticle: vi.fn().mockResolvedValue(publishedArticle),
      updateArticle
    })

    await runEditorialStagePublishWorkflow(params)

    expect(updateArticle).toHaveBeenCalledOnce()
    const [, secondPayload] = updateArticle.mock.calls[0]
    expect(secondPayload.seoSection?.structuredData).toEqual(
      expect.objectContaining({
        '@context': 'https://schema.org'
      })
    )
    expect(JSON.stringify(secondPayload.seoSection?.structuredData)).toContain(
      '"datePublished":"2026-03-02T00:00:00.000Z"'
    )
    expect(JSON.stringify(secondPayload.seoSection?.structuredData)).toContain(
      '"name":"Jane Doe"'
    )
    expect(events.at(-1)).toBe('success:Published article #42')
  })
})
