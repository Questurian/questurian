import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ItineraryPipelinePage from './ItineraryPipelinePage'
import { AuthContext, type AuthContextValue } from '../auth'
import { STORAGE_PREFIX } from './draftRepository'

/**
 * The whole workflow, driven the way an operator drives it.
 *
 * The unit tests prove the rules; this proves they are reachable — that the
 * gate really does stop you, that the day you edited is the day that changed,
 * and that nothing on the way to the workspace asks the network for anything.
 */

const listLibraryDayShells = vi.fn()

vi.mock('../listicleItineraries', () => ({
  listLibraryDayShells: () => listLibraryDayShells(),
}))

/** Any call to the backend from this screen is a failure, so watch for one. */
const fetchSpy = vi.fn()

function renderPage(user: { id: string; email: string } | null = { id: 'staff-1', email: 'op@questurian.test' }) {
  const value: AuthContextValue = {
    expiresAt: Date.now() + 60_000,
    user,
    isAuthenticated: Boolean(user),
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: async () => {},
    logout: () => {},
  }
  return render(
    <AuthContext.Provider value={value}>
      <ItineraryPipelinePage />
    </AuthContext.Provider>,
  )
}

/**
 * The stage rail and the action bar both offer "Shape days" — the rail as a way
 * back, the bar as the way on. Tests want the way on.
 */
function action(name: RegExp | string): HTMLElement {
  const rail = screen.getByRole('navigation', { name: 'Setup stages' })
  const match = screen.getAllByRole('button', { name }).find(button => !rail.contains(button))
  if (!match) throw new Error(`No action button named ${String(name)}`)
  return match
}

async function fillTripDetails(days = '3') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Itinerary title'), 'Three easy days of food and culture in Lima')
  await user.clear(screen.getByLabelText('Number of days'))
  await user.type(screen.getByLabelText('Number of days'), days)
  await user.type(screen.getByLabelText('Base city'), 'Lima, Peru')
  await user.click(action(/shape days/i))
  return user
}

async function approveEveryDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(action(/review layouts/i))
  for (const button of screen.getAllByRole('button', { name: 'Approve layout' })) {
    await user.click(button)
  }
}

beforeEach(() => {
  window.localStorage.clear()
  listLibraryDayShells.mockResolvedValue([])
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

describe('trip details', () => {
  it('blocks on the required fields and keeps what was typed', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Itinerary title'), 'Three easy days in Lima')
    await user.click(action(/shape days/i))

    expect(await screen.findByRole('alert')).toHaveTextContent('Add a base city.')
    expect(screen.getByLabelText('Itinerary title')).toHaveValue('Three easy days in Lima')
    // Optional fields are not failures.
    expect(screen.queryByText(/Starting base/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent(/starting base/i)
  })

  it('turns a valid three-day trip into three independent tabs', async () => {
    renderPage()
    await fillTripDetails('3')

    expect(await screen.findByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('Day 1')
    expect(tabs[2]).toHaveTextContent('Day 3')
    // The title is kept word for word.
    expect(
      screen.getAllByText('Three easy days of food and culture in Lima').length,
    ).toBeGreaterThan(0)
  })
})

describe('shaping a day', () => {
  it('previews a different day type before replacing anything', async () => {
    renderPage()
    const user = await fillTripDetails('2')
    await user.click(screen.getAllByRole('tab')[1])

    await user.selectOptions(screen.getByLabelText('Day type'), 'food_focused_full_day')

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Signature lunch/)).toBeInTheDocument()
    // Nothing has changed yet.
    expect(screen.getByLabelText('Day type')).toHaveValue('full_day_balanced')

    await user.click(within(dialog).getByRole('button', { name: 'Keep current layout' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Day type')).toHaveValue('full_day_balanced')
  })

  it('changes only the day it was asked to change', async () => {
    renderPage()
    const user = await fillTripDetails('3')
    await user.click(screen.getAllByRole('tab')[1])
    await user.selectOptions(screen.getByLabelText('Day type'), 'food_focused_full_day')
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use this layout' }))

    expect(await screen.findByText('Signature lunch')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')[1]).toHaveTextContent('Ready')

    await user.click(screen.getAllByRole('tab')[0])
    expect(screen.getByLabelText('Day type')).toHaveValue('full_day_balanced')
    expect(screen.queryByText('Signature lunch')).not.toBeInTheDocument()
  })

  it('moves a stop from the keyboard and offers Undo after a removal', async () => {
    renderPage()
    const user = await fillTripDetails('1')

    const before = screen.getAllByRole('button', { name: /^Move .* down$/ })
    await user.click(before[0])
    const order = screen.getAllByRole('button', { name: /^Move .* up$/ }).map(button =>
      button.getAttribute('aria-label'),
    )
    expect(order[0]).toBe('Move Neighborhood exploration up')
    expect(order[1]).toBe('Move Signature activity up')

    await user.click(screen.getByRole('button', { name: 'Remove Lunch' }))
    expect(screen.queryByRole('button', { name: 'Remove Lunch' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /undo/i }))
    expect(screen.getByRole('button', { name: 'Remove Lunch' })).toBeInTheDocument()
  })

  it('says which stops a narrower window leaves out instead of deleting them', async () => {
    renderPage()
    const user = await fillTripDetails('1')
    await user.selectOptions(screen.getByLabelText('Available time'), 'morning_only')

    expect(await screen.findAllByText(/window leaves out/)).not.toHaveLength(0)
    // The stops are still there to be moved or removed.
    expect(screen.getByRole('button', { name: 'Remove Dinner' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')[0]).toHaveTextContent('Needs layout')
  })
})

describe('reducing the day count', () => {
  it('names the days it would remove, and Cancel loses nothing', async () => {
    renderPage()
    const user = await fillTripDetails('3')

    // Put something on Day 3 that a number field has no business deleting.
    await user.click(screen.getAllByRole('tab')[2])
    // `summary` has no implicit ARIA role, so it is found by its text.
    await user.click(screen.getByText(/^Day notes/))
    await user.type(screen.getByLabelText('Notes for day 3 setup'), 'Lands at 11am')

    await user.click(
      within(screen.getByRole('navigation', { name: 'Setup stages' })).getByRole('button', {
        name: 'Trip details',
      }),
    )
    await user.clear(screen.getByLabelText('Number of days'))
    await user.type(screen.getByLabelText('Number of days'), '2')
    expect(screen.getByLabelText('Number of days')).toHaveValue(2)
    await user.click(action(/shape days/i))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Day 3')
    expect(dialog).toHaveTextContent('day notes')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    // Cancel puts the count back, so the form and the days agree again and
    // nothing has been removed.
    expect(screen.getByLabelText('Number of days')).toHaveValue(3)

    await user.clear(screen.getByLabelText('Number of days'))
    await user.type(screen.getByLabelText('Number of days'), '2')
    await user.click(action(/shape days/i))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Remove/ }))
    expect(await screen.findByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
})

describe('the approval gate', () => {
  it('will not open the workspace until every layout is approved', async () => {
    renderPage()
    const user = await fillTripDetails('3')
    await user.click(action(/review layouts/i))

    const openWorkspace = action(/open day workspace/i)
    expect(openWorkspace).toBeDisabled()

    const approveButtons = screen.getAllByRole('button', { name: 'Approve layout' })
    await user.click(approveButtons[0])
    await user.click(approveButtons[1])
    expect(screen.getByText(/Approve Day 3 to continue/)).toBeInTheDocument()
    expect(action(/open day workspace/i)).toBeDisabled()

    await user.click(screen.getAllByRole('button', { name: 'Approve layout' })[0])
    expect(action(/open day workspace/i)).toBeEnabled()
  })

  it('reopens every approval when a shared trip detail changes', async () => {
    renderPage()
    const user = await fillTripDetails('2')
    await approveEveryDay(user)
    expect(screen.getAllByText('Layout approved')).toHaveLength(2)

    await user.click(
      within(screen.getByRole('navigation', { name: 'Setup stages' })).getByRole('button', {
        name: 'Trip details',
      }),
    )
    await user.type(screen.getByLabelText('Base city'), ' — Miraflores')
    await user.click(action(/shape days/i))
    await user.click(action(/review layouts/i))

    expect(screen.queryByText('Layout approved')).not.toBeInTheDocument()
    expect(screen.getAllByText('Trip details changed. Review this layout again.')).toHaveLength(2)
    expect(action(/open day workspace/i)).toBeDisabled()
  })
})

describe('the day workspace', () => {
  it('keeps notes with their own day and buys nothing on the way in', async () => {
    renderPage()
    const user = await fillTripDetails('2')
    await approveEveryDay(user)
    await user.click(action(/open day workspace/i))

    expect(await screen.findByRole('heading', { name: 'Plan each day' })).toBeInTheDocument()
    // The interview is offered and is not started. Arriving at a day that has
    // never been handed to the backend asks the network for nothing at all:
    // opening a screen is not a decision to spend, and a reload must not be.
    expect(screen.getByRole('button', { name: /Start day Grill/ })).toBeEnabled()
    expect(screen.queryByRole('textarea')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Notes for this day'), 'Ask about the Sunday market')
    await user.click(screen.getByRole('button', { name: 'Save notes' }))

    await user.click(screen.getAllByRole('tab')[1])
    expect(screen.getByLabelText('Notes for this day')).toHaveValue('')

    await user.click(screen.getAllByRole('tab')[0])
    expect(screen.getByLabelText('Notes for this day')).toHaveValue('Ask about the Sunday market')

    // The shared trip is inherited, not re-entered.
    expect(screen.getAllByText('Lima, Peru').length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('restores the same operator draft and never hands it to another', async () => {
    const first = renderPage()
    await fillTripDetails('2')
    expect(await screen.findByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()
    // Autosave is debounced; the stage change flushes it.
    expect(
      Object.keys(window.localStorage).some(key => key.startsWith(STORAGE_PREFIX)),
    ).toBe(true)
    first.unmount()

    renderPage()
    expect(await screen.findByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    screen.getByRole('heading', { name: 'Shape your days' })
    const second = screen.getByText('Three easy days of food and culture in Lima')
    expect(second).toBeInTheDocument()

    // A different operator starts clean.
    renderPage({ id: 'staff-2', email: 'other@questurian.test' })
    expect(await screen.findAllByRole('heading', { name: 'Start with your itinerary' })).not.toHaveLength(0)
  })

  it('says the draft is not saved when there is no signed-in identity', async () => {
    renderPage(null)
    expect(await screen.findByText(/this draft is lost if you reload/i)).toBeInTheDocument()
  })
})

describe('the saved-layout library', () => {
  it('offers built-ins with a retry when the library cannot be reached', async () => {
    listLibraryDayShells.mockRejectedValue(new Error('Failed to load the day shell library'))
    renderPage()
    await fillTripDetails('1')

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText(/Built-in types still work/)).toBeInTheDocument()
    const options = within(screen.getByLabelText('Day type')).getAllByRole('option')
    expect(options.map(option => option.textContent)).toContain('Culture & Stroll Day')
  })
})

describe('starting over', () => {
  it('asks first, then clears the trip and its workspace link', async () => {
    const key = `${STORAGE_PREFIX}:staff-1`
    renderPage()
    const user = await fillTripDetails()
    expect(screen.getByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Start over/ }))
    // Keeping the trip changes nothing.
    await user.click(screen.getByRole('button', { name: 'Keep this trip' }))
    expect(screen.getByRole('heading', { name: 'Shape your days' })).toBeInTheDocument()

    const before = JSON.parse(window.localStorage.getItem(key) ?? '{}')
    await user.click(screen.getByRole('button', { name: /Start over/ }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Start over' }))

    expect(screen.getByLabelText('Itinerary title')).toHaveValue('')
    expect(screen.getByLabelText('Base city')).toHaveValue('')
    const after = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    // A new draft id means the next interview starts a new run.
    if (after) {
      expect(after.draftId).not.toBe(before.draftId)
      expect(after.workspaceId).toBeUndefined()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
