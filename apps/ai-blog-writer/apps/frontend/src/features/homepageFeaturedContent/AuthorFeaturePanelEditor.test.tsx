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
  descriptionMode: 'profile',
  expertiseMode: 'profile',
  selectedExpertise: [],
  authorCard: {
    author: {
      id: 1,
      name: 'Alan Malpartida',
      slug: 'alan-malpartida',
      href: '/authors/alan-malpartida',
      bio: 'Local guide.',
      expertise: ['Lima']
    },
    displayDescription: 'Local guide.',
    displayExpertise: ['Lima'],
    imageMediaSetId: 11,
    image,
    imageSquare: image,
    imageWide: image,
    imageAltReady: true,
    spotlightNote: 'Local expat'
  }
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
        bio: 'Local guide.',
        expertise: [
          { area: 'Lima, Peru' },
          { area: 'Peruvian Restaurants' },
          { area: 'Digital Nomad' }
        ],
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
  it('saves editable kicker, custom description, and one selected expertise label', async () => {
    const user = userEvent.setup()
    const saveFields = renderEditor()

    await user.click(screen.getByText('Author feature panel'))
    await user.clear(screen.getByRole('textbox', { name: 'Kicker' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Kicker' }),
      'Meet the expert'
    )
    await user.click(
      screen.getByRole('radio', { name: 'Write custom description' })
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Custom description' }),
      'Independent Lima guide.'
    )
    await user.click(
      screen.getByRole('radio', { name: 'Choose expertise to show' })
    )
    await user.click(screen.getByRole('checkbox', { name: 'Digital Nomad' }))
    await user.click(
      screen.getByRole('button', { name: 'Save Author feature' })
    )

    await waitFor(() =>
      expect(saveFields).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionHeading: 'Meet the expert',
          sectionSubheading: 'Independent Lima guide.',
          descriptionMode: 'custom',
          expertiseMode: 'selected',
          selectedExpertise: ['Digital Nomad']
        })
      )
    )
  })

  it('saves a square treatment with the one Author card', async () => {
    const user = userEvent.setup()
    const saveFields = renderEditor(
      vi.fn(async () => {}),
      {
        ...block,
        imageStyle: 'portrait'
      }
    )

    await user.click(screen.getByText('Author feature panel'))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Portrait treatment' }),
      'square'
    )
    await user.click(
      screen.getByRole('button', { name: 'Save Author feature' })
    )

    await waitFor(() =>
      expect(saveFields).toHaveBeenCalledWith(
        expect.objectContaining({
          imageStyle: 'square',
          authorCards: [{ author: 1, image: 11, spotlightNote: 'Local expat' }]
        })
      )
    )
  })

  it('keeps a complete Author panel closed and exposes one Author selector', async () => {
    const user = userEvent.setup()
    renderEditor()

    const summary = screen.getByText('Author feature panel')
    expect(summary.closest('details')).not.toHaveAttribute('open')

    await user.click(summary)
    expect(screen.getByRole('combobox', { name: 'Author' })).toHaveValue('1')
    expect(
      screen.getByRole('combobox', { name: 'Portrait treatment' })
    ).toHaveValue('square')
    expect(screen.queryByRole('button', { name: 'Add Author' })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Use Alan portrait' })
      ).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('replaces the Author and requires an explicit image choice', async () => {
    const user = userEvent.setup()
    const saveFields = renderEditor(vi.fn(async () => {}), {
      ...block,
      descriptionMode: 'custom',
      sectionSubheading: 'Previous Author description.'
    })

    await user.click(screen.getByText('Author feature panel'))
    expect(
      screen.getByRole('radio', { name: 'Write custom description' })
    ).toBeChecked()
    const authorSelect = await screen.findByRole('combobox', { name: 'Author' })
    await user.selectOptions(authorSelect, '2')

    expect(
      screen.getByRole('radio', { name: 'Use bio from profile' })
    ).toBeChecked()
    expect(screen.getByText('No profile bio yet.')).toBeInTheDocument()
    expect(screen.queryByText('Local guide.')).toBeNull()
    await user.click(
      screen.getByRole('radio', { name: 'Choose expertise to show' })
    )
    expect(screen.getByText('No profile expertise yet.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Lima' })).toBeNull()

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
        authorCards: [{ author: 2, image: 22, spotlightNote: null }]
      })
    )
  })
})
