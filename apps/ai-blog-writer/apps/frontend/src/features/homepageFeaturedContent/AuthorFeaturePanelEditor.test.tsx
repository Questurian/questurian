import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { payloadRequest } from '../../shared/api/client/http'
import type { AuthorFeatureBlockResponse } from './pageBlocks'
import AuthorFeaturePanelEditor from './AuthorFeaturePanelEditor'

vi.mock('../../shared/api/client/http', () => ({
  payloadRequest: vi.fn()
}))

vi.mock('../staff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../staff')>()
  return {
    ...actual,
    AuthorImagePlacementEditor: () => <div>Placement editor</div>
  }
})

const image = {
  url: '/author.webp',
  alt: 'Author portrait',
  width: 1080,
  height: 1080,
  variant: 'square',
  status: 'ready'
}

const block: AuthorFeatureBlockResponse = {
  id: 'author-1',
  blockType: 'author-feature',
  selection: {
    totalSlots: 3,
    items: [],
    invalidItems: [],
    isComplete: true,
    allowDrafts: false
  },
  sectionHeading: null,
  sectionSubheading: null,
  imageStyle: 'square',
  motionStyle: 'subtle',
  authorCards: [
    {
      author: {
        id: 1,
        name: 'Alan Malpartida',
        slug: 'alan-malpartida',
        href: '/authors/alan-malpartida',
        bio: 'Local guide.',
        expertise: ['Lima']
      },
      imageMediaSetId: 11,
      image,
      imageSquare: image,
      imageWide: image,
      imageAltReady: true,
      spotlightNote: 'Local expat',
      isEmphasized: true
    }
  ]
}

function renderEditor(
  saveFields = vi.fn(async () => {}),
  currentBlock = block
) {
  vi.mocked(payloadRequest).mockResolvedValue({
    docs: [
      {
        id: 1,
        displayName: 'Alan Malpartida',
        authorImages: [{ mediaSet: { id: 11, title: 'Alan portrait' } }]
      },
      {
        id: 2,
        displayName: 'Second Author',
        authorImages: [{ mediaSet: { id: 22, title: 'Studio portrait' } }]
      }
    ]
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AuthorFeaturePanelEditor
        block={currentBlock}
        canManage
        saveFields={saveFields}
      />
    </QueryClientProvider>
  )

  return saveFields
}

describe('AuthorFeaturePanelEditor', () => {
  it('keeps a complete single-Author panel closed and hides main-portrait choice', async () => {
    const user = userEvent.setup()
    renderEditor()

    const summary = screen.getByText('Author feature panel')
    expect(summary.closest('details')).not.toHaveAttribute('open')

    await user.click(summary)
    expect(screen.queryByRole('radio', { name: 'Main portrait' })).toBeNull()
    expect(screen.getByText('Single Author')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Single Author treatment' })
    ).toHaveValue('square')
    expect(screen.queryByRole('option', { name: /Mixed/i })).toBeNull()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Use Alan portrait' })
      ).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('requires an explicit image choice when adding a supporting Author', async () => {
    const user = userEvent.setup()
    const saveFields = renderEditor()

    await user.click(screen.getByText('Author feature panel'))
    const authorSelect = await screen.findByRole('combobox', {
      name: 'Add supporting Author'
    })
    await user.selectOptions(authorSelect, '2')
    await user.click(screen.getByRole('button', { name: 'Add Author' }))

    expect(screen.getByText('Multiple Authors')).toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Single Author treatment' })
    ).toBeNull()
    expect(
      screen.getByText('Choose one of this Author’s uploaded images.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save Author feature' })
    ).toBeDisabled()

    await user.click(
      screen.getByRole('button', { name: 'Use Studio portrait' })
    )
    await user.click(
      screen.getByRole('button', { name: 'Save Author feature' })
    )

    await waitFor(() => expect(saveFields).toHaveBeenCalledTimes(1))
    expect(saveFields).toHaveBeenCalledWith(
      expect.objectContaining({
        authorCards: expect.arrayContaining([
          expect.objectContaining({ author: 2, image: 22 })
        ])
      })
    )
  })

  it('normalizes legacy mixed treatment to portrait for one Author', async () => {
    const user = userEvent.setup()
    const saveFields = vi.fn(async () => {})
    renderEditor(saveFields, { ...block, imageStyle: 'mixed' })

    await user.click(screen.getByText('Author feature panel'))
    expect(
      screen.getByRole('combobox', { name: 'Single Author treatment' })
    ).toHaveValue('portrait')
    await user.click(
      screen.getByRole('button', { name: 'Save Author feature' })
    )

    await waitFor(() =>
      expect(saveFields).toHaveBeenCalledWith(
        expect.objectContaining({ imageStyle: 'portrait' })
      )
    )
  })
})
