import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  regenerateAuthorMediaSet,
  updateAuthorMediaSetPlacement
} from '../api/staff.api'
import AuthorImagePlacementEditor from './AuthorImagePlacementEditor'

vi.mock('../api/staff.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/staff.api')>()
  return {
    ...actual,
    fetchMediaSet: vi.fn(async () => ({
      id: 11,
      source: { id: 101, url: '/source.webp' },
      focal_point: { x: 0.5, y: 0.5 }
    })),
    updateAuthorMediaSetPlacement: vi.fn(async () => ({})),
    regenerateAuthorMediaSet: vi.fn(async () => {})
  }
})

describe('AuthorImagePlacementEditor', () => {
  it('shows all target crops and refreshes the block after regeneration', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn(async () => {})
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <AuthorImagePlacementEditor
          mediaSet={{
            id: 11,
            source: { id: 101, url: '/source.webp' },
            focal_point: { x: 0.5, y: 0.5 }
          }}
          onSaved={onSaved}
        />
      </QueryClientProvider>
    )

    expect(screen.getByLabelText('Crop preview')).toHaveTextContent(
      'PortraitSquareWide'
    )

    const source = screen.getByAltText('Selected Author source')
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({})
    })
    fireEvent.click(source, { clientX: 50, clientY: 75 })
    await user.click(screen.getByRole('button', { name: 'Save placement' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(updateAuthorMediaSetPlacement).toHaveBeenCalledWith(11, {
      x: 0.25,
      y: 0.75
    })
    expect(regenerateAuthorMediaSet).toHaveBeenCalledWith(11)
  })
})
