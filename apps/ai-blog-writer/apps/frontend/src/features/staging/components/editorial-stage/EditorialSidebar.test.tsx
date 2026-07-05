/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorialSidebar } from './EditorialSidebar'
import type { StagedArticle } from '../../types'

let mockedPermissions = {
  canManagePublished: true,
  role: 'admin' as string | null,
  isLoading: false,
}

vi.mock('../../../auth', () => ({
  usePermissions: () => mockedPermissions,
}))

function buildStagedArticle(overrides?: Partial<StagedArticle>): StagedArticle {
  return {
    id: 'staged_1',
    runId: 'run_1',
    originalTitle: '',
    originalContent: '',
    originalType: '',
    title: 'Title',
    content: 'Body',
    blocks: [],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderSidebar(overrides?: Partial<StagedArticle>) {
  return render(
    <EditorialSidebar
      stagedArticle={buildStagedArticle(overrides)}
      isPublishing={false}
      allFieldsFilled
      missingPublishFields={[]}
      editorialBlockingMessages={[]}
      publishResult={null}
      featuredImageRequirementLabel="1200x630"
      selectedFeaturedImage={null}
      getImageUrl={vi.fn(() => '')}
      onOpenFeaturedImageModal={vi.fn()}
      locations={[]}
      onUpdateStagedArticle={vi.fn()}
      onPublish={vi.fn()}
    />,
  )
}

describe('EditorialSidebar', () => {
  it('renders an enabled publish path for editors/admins', () => {
    mockedPermissions = { canManagePublished: true, role: 'editor', isLoading: false }

    renderSidebar()

    expect(screen.getByRole('button', { name: /Publish/ })).toBeInTheDocument()
    expect(screen.queryByText(/requires an editor or admin role/)).not.toBeInTheDocument()
  })

  it('renders the publish button disabled with a role reason for writers', () => {
    mockedPermissions = { canManagePublished: false, role: 'writer', isLoading: false }

    renderSidebar()

    const publishButton = screen.getByRole('button', { name: /^Publish$/ })
    expect(publishButton).toBeDisabled()
    expect(
      screen.getByText(/Publishing requires an editor or admin role \(you are signed in as writer\)/),
    ).toBeInTheDocument()
  })

  it('explains that published articles need an editor when the article is published', () => {
    mockedPermissions = { canManagePublished: false, role: 'writer', isLoading: false }

    renderSidebar({ payloadStatus: 'published', payloadArticleId: 7 })

    expect(screen.getByRole('button', { name: /Update Published/ })).toBeDisabled()
    expect(
      screen.getByText(/Updating a published article requires an editor or admin role/),
    ).toBeInTheDocument()
  })
})
