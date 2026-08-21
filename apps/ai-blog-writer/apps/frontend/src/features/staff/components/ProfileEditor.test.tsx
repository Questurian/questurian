import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProfileEditor from './ProfileEditor'
import { fetchAuthorById, updateAuthor } from '../api/staff.api'

vi.mock('../api/staff.api', async () => {
  const actual = await vi.importActual<typeof import('../api/staff.api')>('../api/staff.api')
  return {
    ...actual,
    fetchAuthorById: vi.fn(),
    updateAuthor: vi.fn(),
  }
})

const mockFetchAuthorById = vi.mocked(fetchAuthorById)
const mockUpdateAuthor = vi.mocked(updateAuthor)

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProfileEditor
        subject={{ kind: 'author', authorId: 9 }}
        can={{
          editSlug: false,
          editAccountNames: false,
          showAccountHeader: false,
        }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('ProfileEditor article byline', () => {
  it('saves avatar visibility and up to three selected profile links', async () => {
    mockFetchAuthorById.mockResolvedValue({
      id: 9,
      displayName: 'Lima Creator',
      avatar: { id: 12, url: 'https://cdn.example/avatar.webp' },
      socialLinks: { instagram: 'https://instagram.com/lima-creator' },
    })
    mockUpdateAuthor.mockImplementation(async (_id, patch) => ({
      id: 9,
      displayName: 'Lima Creator',
      ...patch,
    }))

    renderEditor()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('checkbox', { name: /show avatar on articles/i }))
    await user.click(screen.getByRole('checkbox', { name: /feature instagram/i }))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await waitFor(() =>
      expect(mockUpdateAuthor).toHaveBeenCalledWith(
        9,
        expect.objectContaining({
          articleByline: {
            showAvatar: true,
            featuredLinks: ['instagram'],
          },
        }),
      ),
    )
  })

  it('keeps a selected link visible after its URL is cleared so it can be removed', async () => {
    mockFetchAuthorById.mockResolvedValue({
      id: 9,
      displayName: 'Lima Creator',
      socialLinks: { instagram: 'https://instagram.com/lima-creator' },
      articleByline: { showAvatar: false, featuredLinks: ['instagram'] },
    })
    mockUpdateAuthor.mockImplementation(async (_id, patch) => ({
      id: 9,
      displayName: 'Lima Creator',
      ...patch,
    }))

    renderEditor()
    const user = userEvent.setup()

    await user.clear(await screen.findByRole('textbox', { name: /instagram url/i }))
    await user.click(
      screen.getByRole('checkbox', { name: /feature instagram \(url missing\)/i }),
    )
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await waitFor(() =>
      expect(mockUpdateAuthor).toHaveBeenCalledWith(
        9,
        expect.objectContaining({
          articleByline: { showAvatar: false, featuredLinks: [] },
          socialLinks: expect.objectContaining({ instagram: null }),
        }),
      ),
    )
  })
})
