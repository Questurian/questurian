import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'
import { AuthContext, type AuthContextValue } from './providers/auth-context'

const PRIMARY_CARD_TITLES = [
  'YouTube → Articles',
  'URL → Articles',
  'Prompt → Articles',
  'Single Type Listicles',
  'Listicle Itineraries',
  'Location Documents',
  'Homepage Featured Content',
]

const OCCASIONAL_CARD_TITLES = [
  'Reviews → Articles',
  'Keyword Intel',
  'Image Recreation Prompts',
  'Batch Image Recreation',
  'Batch Image Upload',
]

function createAuthValue(role = 'admin'): AuthContextValue {
  return {
    token: 'landing-token',
    expiresAt: Date.now() + 60_000,
    user: {
      id: 'user-1',
      email: 'editor@example.com',
      role,
    },
    isAuthenticated: true,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: async () => undefined,
    logout: () => undefined,
  }
}

function renderPage(role = 'admin') {
  return render(
    <AuthContext.Provider value={createAuthValue(role)}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LandingPage', () => {
  it('renders the primary sections in order and keeps occasional tools collapsed by default', () => {
    renderPage()

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Article Generation', 'Structured Publishing', 'Occasional Tools'])

    expect(
      screen.getByRole('button', { name: /show occasional tools/i }),
    ).toHaveAttribute('aria-expanded', 'false')

    PRIMARY_CARD_TITLES.forEach((title) => {
      expect(screen.getAllByRole('heading', { level: 3, name: title })).toHaveLength(1)
    })

    OCCASIONAL_CARD_TITLES.forEach((title) => {
      expect(screen.queryByRole('heading', { level: 3, name: title })).not.toBeInTheDocument()
    })
  })

  it('shows each occasional tool exactly once when expanded', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /show occasional tools/i }))

    expect(
      screen.getByRole('button', { name: /hide occasional tools/i }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { level: 3, name: 'Editorial Utilities' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Research & SEO' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Media Tools' })).toBeInTheDocument()

    ;[...PRIMARY_CARD_TITLES, ...OCCASIONAL_CARD_TITLES].forEach((title) => {
      expect(screen.getAllByRole('heading', { level: 3, name: title })).toHaveLength(1)
    })
  })

  it('collapses occasional tools again after toggling closed', () => {
    renderPage()

    const toggle = screen.getByRole('button', { name: /show occasional tools/i })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /hide occasional tools/i }))

    expect(
      screen.getByRole('button', { name: /show occasional tools/i }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { level: 3, name: 'Keyword Intel' })).not.toBeInTheDocument()
  })

  it('hides homepage featured content for writer accounts', () => {
    renderPage('writer')

    expect(screen.queryByRole('heading', { level: 3, name: 'Homepage Featured Content' })).not.toBeInTheDocument()
  })
})
