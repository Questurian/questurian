/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { StandardArticleStageBuilder } from './StandardArticleStageBuilder'
import type { StagedArticle } from '../types'
import type { SeoSection } from '../../shared/seo/types'

type MockViewModel = ReturnType<typeof buildViewModel>

let mockedViewModel: MockViewModel

vi.mock('../../../providers/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { role: 'admin' },
  }),
}))

vi.mock('../features/editorial-stage-article/hooks/useEditorialStageArticleScreenViewModel', () => ({
  useEditorialStageArticleScreenViewModel: () => mockedViewModel,
}))

vi.mock('../../shared/seo/components/SeoEditorPanel', () => ({
  SeoEditorPanel: ({ title }: { title: string }) => (
    <section>
      <h2>{title}</h2>
    </section>
  ),
}))

vi.mock('./editorial-stage/FeaturedImageModal', () => ({
  FeaturedImageModal: () => null,
}))

vi.mock('./editorial-stage/BlockImageModal', () => ({
  BlockImageModal: () => null,
}))

vi.mock('./editorial-stage/EditorialTimelineList', () => ({
  EditorialTimelineList: () => <div>Timeline Content</div>,
}))

function buildSeoSection(overrides?: Partial<SeoSection>): SeoSection {
  return {
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
    ...overrides,
  }
}

function buildStagedArticle(overrides?: Partial<StagedArticle>): StagedArticle {
  return {
    id: 'staged-1',
    runId: 'run-1',
    originalTitle: 'Original title',
    originalContent: '## Intro\n\nBody copy',
    originalType: 'youtube2blog',
    title: 'YouTube article',
    content: '## Intro\n\nBody copy',
    blocks: [
      {
        id: 'block-1',
        type: 'text',
        content: '## Intro\n\nBody copy',
      },
    ],
    editorialBlocks: [],
    locationId: 1,
    sharedNeighborhoods: [],
    editorModelName: 'gemini-2.5-flash',
    featuredImageId: 22,
    step1_complete: false,
    in_update_mode: false,
    step2_complete: false,
    step2_in_update_mode: false,
    step3_complete: false,
    step3_in_update_mode: false,
    seoSection: buildSeoSection(),
    syncBehavior: 'draft-sync',
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-04-09T12:00:00.000Z',
    updatedAt: '2026-04-09T12:00:00.000Z',
    ...overrides,
  }
}

function buildViewModel(input?: {
  stagedArticle?: StagedArticle
  editorialBlockingMessages?: string[]
}) {
  const stagedArticle = input?.stagedArticle ?? buildStagedArticle()
  const selectedFeaturedImage = stagedArticle.featuredImageId
    ? {
        id: stagedArticle.featuredImageId,
        filename: 'featured-image.jpg',
      }
    : null

  return {
    status: {
      isLoading: false,
      error: null,
      stagedArticle,
      articlesPath: '/youtube2blog/articles',
    },
    layout: {
      stagedArticle,
      stagePath: '/youtube2blog/stage',
      onDelete: vi.fn(),
      onResetToOriginalBlocks: vi.fn(),
      onUpdateTitle: vi.fn(),
    },
    timelineListProps: {},
    sidebarProps: {
      locations: [
        {
          id: 1,
          locationKey: 'lima-peru',
          level: 'city',
          cityName: 'Lima',
          countryName: 'Peru',
          neighborhoodName: '',
        },
      ],
      editorialBlockingMessages: input?.editorialBlockingMessages ?? [],
      selectedFeaturedImage,
      getImageUrl: vi.fn(() => 'https://example.com/featured.jpg'),
      onUpdateStagedArticle: vi.fn(),
      onOpenFeaturedImageModal: vi.fn(),
      isPublishing: false,
      publishResult: null,
      onPublish: vi.fn(),
    },
    featuredModalProps: {},
    blockModalProps: {},
  }
}

const api = {
  fetchLocations: vi.fn(async () => ({ docs: [], totalDocs: 0, totalPages: 0 })),
  fetchMediaAssets: vi.fn(async () => ({ docs: [], totalDocs: 0, totalPages: 0 })),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  getArticleById: vi.fn(),
  convertMarkdownToLexical: vi.fn(async () => ({ success: true, data: {} })),
  fetchExternalImageSource: vi.fn(),
  fetchResult: vi.fn(async () => ({ markdown: '' })),
  importExternalImage: vi.fn(),
  markArticleSynced: vi.fn(),
  getArticleSyncStatus: vi.fn(),
  searchPexelsImages: vi.fn(async () => ({ photos: [] })),
  searchUnsplashImages: vi.fn(async () => ({ photos: [] })),
  rewriteBlockWithAi: vi.fn(async () => ({ rewritten_content: 'rewritten' })),
}

function renderBuilder() {
  return render(
    <MemoryRouter>
      <StandardArticleStageBuilder
        storageKey="youtube2blog_staged_articles_v2"
        routes={{
          stagePath: '/youtube2blog/stage',
          stageArticlePath: '/youtube2blog/stage-article',
          articlesPath: '/youtube2blog/articles',
        }}
        api={api}
        featureLabel="YouTube2Blog"
        heroDescription="Step through setup, featured image selection, article content blocks, and SEO before saving drafts or publishing to Payload."
        syncBehavior="draft-sync"
      />
    </MemoryRouter>,
  )
}

describe('StandardArticleStageBuilder', () => {
  it('renders the standard 4-step article builder shell', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        step1_complete: true,
        step2_complete: true,
        step3_complete: true,
        seoSection: buildSeoSection({
          seoTitle: 'SEO title',
          metaDescription: 'Meta description',
        }),
      }),
    })

    renderBuilder()

    expect(screen.getByRole('heading', { name: /Setup/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Featured Image/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Content Blocks/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SEO & Sync' })).toBeInTheDocument()
  })

  it('blocks Step 1 until title and location are provided', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        title: '',
        locationId: undefined,
      }),
    })

    renderBuilder()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 2' }))

    expect(screen.getByText('Step 1 requires an article title.')).toBeInTheDocument()
  })

  it('blocks Step 2 until a featured image is selected', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        step1_complete: true,
        featuredImageId: undefined,
      }),
    })

    renderBuilder()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 3' }))

    expect(screen.getByText('Step 2 requires a featured image.')).toBeInTheDocument()
  })

  it('blocks Step 3 when no article body exists', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        content: '',
        blocks: [],
        step1_complete: true,
        step2_complete: true,
      }),
    })

    renderBuilder()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 4' }))

    expect(screen.getByText('Step 3 requires at least one text block with content.')).toBeInTheDocument()
  })

  it('blocks Step 3 when editorial issues are still unresolved', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        step1_complete: true,
        step2_complete: true,
      }),
      editorialBlockingMessages: ['Key Takeaways needs content before Step 3 can lock.'],
    })

    renderBuilder()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Step 4' }))

    expect(screen.getByText('Key Takeaways needs content before Step 3 can lock.')).toBeInTheDocument()
  })

  it('keeps sync actions disabled until Steps 1-3 are locked and SEO core is complete', () => {
    mockedViewModel = buildViewModel({
      stagedArticle: buildStagedArticle({
        step1_complete: true,
        step2_complete: true,
        step3_complete: true,
        seoSection: buildSeoSection(),
      }),
    })

    renderBuilder()

    expect(screen.getByRole('button', { name: 'Save Draft to Payload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText('SEO core: Missing SEO title or meta description')).toBeInTheDocument()
  })
})
