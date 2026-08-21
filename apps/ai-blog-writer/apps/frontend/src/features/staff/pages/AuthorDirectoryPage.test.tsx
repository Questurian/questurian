import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AuthorDirectoryPage from './AuthorDirectoryPage'
import { useAuth, usePermissions } from '../../auth'
import { fetchEditableAuthors } from '../api/staff.api'

vi.mock('../../auth', async () => {
  const actual = await vi.importActual<typeof import('../../auth')>('../../auth')
  return { ...actual, useAuth: vi.fn(), usePermissions: vi.fn() }
})
vi.mock('../api/staff.api', async () => {
  const actual = await vi.importActual<typeof import('../api/staff.api')>('../api/staff.api')
  return { ...actual, fetchEditableAuthors: vi.fn() }
})

const mockUseAuth = vi.mocked(useAuth)
const mockUsePermissions = vi.mocked(usePermissions)
const mockFetchAuthors = vi.mocked(fetchEditableAuthors)

function stub(role: 'admin' | 'editor' | 'writer', id = '2') {
  mockUseAuth.mockReturnValue({
    expiresAt: Date.now() + 60_000,
    user: { id, email: `${role}@questurian.com`, role },
    isAuthenticated: true,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: vi.fn(),
    logout: vi.fn(),
  } as ReturnType<typeof useAuth>)

  mockUsePermissions.mockReturnValue({
    canManagePublished: role !== 'writer',
    canManageUsers: role === 'admin',
    canEditOtherAuthors: role !== 'writer',
    role,
    isLoading: false,
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthorDirectoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('AuthorDirectoryPage', () => {
  it('turns a writer away without ever querying authors', async () => {
    stub('writer')
    renderPage()

    expect(await screen.findByText(/available to editors and admins/i)).toBeTruthy()
    expect(mockFetchAuthors).not.toHaveBeenCalled()
  })

  /**
   * The scope argument is what makes the listing match the server's access
   * rule. An editor sent 'all' would be shown colleagues they cannot save.
   */
  it('asks for the narrow scope as an editor, and passes their own id', async () => {
    stub('editor', '7')
    mockFetchAuthors.mockResolvedValue([])
    renderPage()

    await waitFor(() => expect(mockFetchAuthors).toHaveBeenCalledWith('writers-and-orphans', '7'))
  })

  it('asks for every author as an admin', async () => {
    stub('admin', '1')
    mockFetchAuthors.mockResolvedValue([])
    renderPage()

    await waitFor(() => expect(mockFetchAuthors).toHaveBeenCalledWith('all', '1'))
  })

  it('marks an unlinked byline, so an orphan is not mistaken for a colleague', async () => {
    stub('editor', '7')
    mockFetchAuthors.mockResolvedValue([
      { id: 4, displayName: 'Alan Writer', slug: 'alan-writer', user: 3 },
      { id: 9, displayName: 'Departed Writer', slug: 'departed', user: null },
    ])
    renderPage()

    expect(await screen.findByText('Departed Writer')).toBeTruthy()
    expect(screen.getAllByText('unlinked')).toHaveLength(1)
  })

  it('marks the acting operator despite the id being a string on one side', async () => {
    // auth-state.ts stringifies the id; Payload returns a number. A plain ===
    // would silently never match and nobody would notice the missing marker.
    stub('editor', '7')
    mockFetchAuthors.mockResolvedValue([
      { id: 2, displayName: 'Alan Editor', slug: 'alan-editor', user: 7 },
      { id: 4, displayName: 'Alan Writer', slug: 'alan-writer', user: 3 },
    ])
    renderPage()

    await screen.findByText('Alan Editor')
    expect(screen.getAllByText('(you)')).toHaveLength(1)
  })

  it('links each row to the author-keyed editor route', async () => {
    stub('admin', '1')
    mockFetchAuthors.mockResolvedValue([
      { id: 9, displayName: 'Departed Writer', slug: 'departed', user: null },
    ])
    renderPage()

    const link = (await screen.findByText('Departed Writer')).closest('a')
    expect(link?.getAttribute('href')).toBe('/authors/9')
  })
})
