import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyDraft } from '../../storage'
import type { ListicleItineraryDraft, LocationOption } from '../../types'
import { BuilderSetupPanel } from './BuilderSetupPanel'

vi.mock('./ItineraryTitlePipelineButton', () => ({
  ItineraryTitlePipelineButton: () => null,
}))

vi.mock('./TravelerProfileModal', () => ({
  TravelerProfileModal: () => null,
}))

vi.mock('./SharedNeighborhoodsModal', () => ({
  SharedNeighborhoodsModal: () => null,
}))

const locations: LocationOption[] = [
  {
    id: 1,
    locationKey: 'peru|cusco',
    country: 'Peru',
    city: 'Cusco',
    level: 'city',
  },
]

function renderSetupPanel(draftOverrides: Partial<ListicleItineraryDraft> = {}) {
  const draft = {
    ...createEmptyDraft(),
    ...draftOverrides,
  }

  return render(
    <BuilderSetupPanel
      draft={draft}
      locations={locations}
      onContinue={vi.fn()}
      onUpdateSetup={vi.fn()}
      onSaveSetup={vi.fn()}
      onCancelUpdateSetup={vi.fn()}
      updateDraft={vi.fn()}
      onGenerateSlugWithAi={vi.fn()}
      onGenerateItinerary={vi.fn()}
      onComposeTravelerBrief={vi.fn()}
    />,
  )
}

describe('BuilderSetupPanel', () => {
  it('keeps manual setup and slug AI while hiding writing controls', () => {
    renderSetupPanel({ title: 'Cusco weekend', location: 'peru|cusco' })
    for (const name of ['Title', 'Location', 'Itinerary Length', 'Slug', 'Day 1 template']) {
      expect(screen.getByLabelText(new RegExp(name))).toBeInTheDocument()
    }
    expect(screen.getByRole('option', { name: 'Hands-On Local Day — 9 stops' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gardens & Slow Living — 8 stops' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'City Photo Walk — 10 stops' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Markets & Live Music — 9 stops' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Rich Standard Day — 11 stops' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Work & Wander Day — 8 stops' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI' })).toBeEnabled()
    expect(screen.queryByText(/Description \(AI/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generate itinerary|Traveler Profile/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/List tone/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Shared neighborhoods/i)).not.toBeInTheDocument()
  })
})
