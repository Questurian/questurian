import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  markDraftAsPayloadSynced,
  refreshDraftPayloadSyncState,
} from '../../../../../shared/payloadSync/draftPayloadSync'
import type { SeoSection } from '../../../../../shared/seo/types'
import type { StagedArticle } from '../../../types'
import {
  buildStagedArticlePayloadComparableShape,
  hasPayloadArticleIdentity,
} from '../services/staged-article-payload-sync.service'
import { useStandardArticleStructuredData } from './useStandardArticleStructuredData'

function buildSeoSection(overrides: Partial<SeoSection> = {}): SeoSection {
  return {
    seoTitle: 'Weekend in Lima',
    metaDescription: 'A weekend in Lima.',
    openGraph: {
      title: 'Weekend in Lima',
      description: 'A weekend in Lima.',
      imageUrl: 'https://example.com/lima.jpg',
      url: 'https://example.com/weekend-in-lima',
    },
    twitterCard: {
      card: 'summary_large_image',
      title: 'Weekend in Lima',
      description: 'A weekend in Lima.',
      imageUrl: '',
    },
    structuredData: '',
    robots: { index: 'index', follow: 'follow' },
    ...overrides,
  }
}

function buildStagedArticle(seoSection: SeoSection): StagedArticle {
  return {
    id: 'staged-1',
    runId: 'run-1',
    originalTitle: 'Weekend in Lima',
    originalContent: 'Lima is full of cafes and coastal views.',
    originalType: 'Travel Guide',
    title: 'Weekend in Lima',
    content: 'Lima is full of cafes and coastal views.',
    blocks: [{ id: 'block-1', type: 'text', content: 'Lima is full of cafes.' }],
    editorialBlocks: [],
    locationId: 10,
    sharedNeighborhoods: [],
    editorModelName: 'gemini-2.5-flash',
    featuredImageId: 99,
    step1_complete: true,
    in_update_mode: false,
    step2_complete: true,
    step2_in_update_mode: false,
    step3_complete: true,
    step3_in_update_mode: false,
    seoSection,
    syncBehavior: 'draft-sync',
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-04T15:45:00.000Z',
  } as StagedArticle
}

/**
 * Drives the hook the way the builder does: `seoSection` is owned outside and
 * fed back in, so an update has to survive a rerender to count.
 */
function renderStructuredData(options: {
  enabled: boolean
  structuredData?: string
  articlePatch?: Partial<StagedArticle>
}) {
  let seoSection = buildSeoSection(
    options.structuredData === undefined ? {} : { structuredData: options.structuredData },
  )
  let articlePatch: Partial<StagedArticle> = options.articlePatch ?? {}

  const readArticle = (): StagedArticle => ({
    ...buildStagedArticle(seoSection),
    ...articlePatch,
  })

  const updateSeoSection = (
    next: SeoSection | ((current: SeoSection) => SeoSection),
  ) => {
    seoSection = typeof next === 'function' ? next(seoSection) : next
  }

  const view = renderHook(() =>
    useStandardArticleStructuredData({
      stagedArticle: readArticle(),
      seoSection,
      selectedLocationLabel: 'Lima, Peru',
      enabled: options.enabled,
      updateSeoSection,
    }),
  )

  return {
    view,
    read: () => seoSection.structuredData,
    readArticle,
    /** Applies a patch the way `updateStagedArticle` does, then re-renders. */
    applyArticlePatch: (patch: Partial<StagedArticle>) => {
      articlePatch = { ...articlePatch, ...patch }
      act(() => view.rerender())
    },
  }
}

describe('useStandardArticleStructuredData auto-manage', () => {
  /**
   * The template's `dateModified` comes from `payloadUpdatedAt`, which Payload
   * bumps on every sync. Regenerating after a sync landed would rewrite the
   * field and re-raise the "Out of sync" banner the sync just cleared — with a
   * fresh timestamp each click, so it could never be cleared.
   */
  it('leaves a freshly synced article alone', () => {
    const { read, readArticle, applyArticlePatch } = renderStructuredData({ enabled: true })

    const structuredDataBeforeSync = read()
    expect(structuredDataBeforeSync).not.toBe('')

    // What publishing does: push the article, then fold Payload's metadata
    // (including the new updatedAt) back in and take that as the sync baseline.
    const syncedAt = '2026-03-05T09:00:00.000Z'
    const synced = markDraftAsPayloadSynced(
      {
        ...readArticle(),
        payloadArticleId: 42,
        publishedToPayload: true,
        payloadStatus: 'draft' as const,
        payloadUpdatedAt: syncedAt,
      },
      buildStagedArticlePayloadComparableShape,
      syncedAt,
      { hasPayloadIdentity: hasPayloadArticleIdentity },
    )
    expect(synced.hasUnsyncedPayloadChanges).toBe(false)

    applyArticlePatch({
      payloadArticleId: synced.payloadArticleId,
      publishedToPayload: true,
      payloadStatus: 'draft',
      payloadUpdatedAt: syncedAt,
      currentPayloadSignature: synced.currentPayloadSignature,
      lastPayloadSyncSignature: synced.lastPayloadSyncSignature,
      lastPayloadSyncAt: synced.lastPayloadSyncAt,
      hasUnsyncedPayloadChanges: false,
    })

    expect(read()).toBe(structuredDataBeforeSync)

    const refreshed = refreshDraftPayloadSyncState(
      readArticle(),
      buildStagedArticlePayloadComparableShape,
      { hasPayloadIdentity: hasPayloadArticleIdentity, missingBaselineIsUnsynced: true },
    )
    expect(refreshed.hasUnsyncedPayloadChanges).toBe(false)
  })

  it('still refreshes the template while the article has unsynced changes', () => {
    const { read, applyArticlePatch } = renderStructuredData({ enabled: true })

    const structuredDataBeforeEdit = read()
    applyArticlePatch({
      payloadArticleId: 42,
      publishedToPayload: true,
      payloadStatus: 'draft',
      payloadUpdatedAt: '2026-03-05T09:00:00.000Z',
      hasUnsyncedPayloadChanges: true,
    })

    expect(read()).not.toBe(structuredDataBeforeEdit)
    expect(JSON.parse(read())['@graph'][0].dateModified).toBe('2026-03-05T09:00:00.000Z')
  })
})

describe('useStandardArticleStructuredData regenerate', () => {
  it('fills the field from the template on demand while auto-manage is off', () => {
    const { view, read } = renderStructuredData({ enabled: false })

    expect(read()).toBe('')
    expect(view.result.current.canRegenerateFromTemplate).toBe(true)

    act(() => view.result.current.regenerateFromTemplate())

    const structuredData = read()
    expect(structuredData).not.toBe('')
    expect(JSON.parse(structuredData)['@context']).toBe('https://schema.org')
  })

  it('overwrites a diverged value that auto-manage has stopped touching', () => {
    const stale = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Thing' })
    const { view, read } = renderStructuredData({ enabled: true, structuredData: stale })

    act(() => view.result.current.regenerateFromTemplate())

    expect(read()).not.toBe(stale)
    expect(JSON.parse(read())['@graph']).toBeDefined()
  })
})
