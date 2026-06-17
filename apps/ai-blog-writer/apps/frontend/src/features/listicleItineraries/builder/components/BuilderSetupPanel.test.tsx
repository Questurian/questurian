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
      onGenerateItinerary={vi.fn()}
      onComposeTravelerBrief={vi.fn()}
    />,
  )
}

describe('BuilderSetupPanel', () => {
  it('blocks AI Autobuild brief controls until title and location exist', () => {
    renderSetupPanel()

    expect(screen.getByText('Add a title before writing or using the AI Autobuild brief.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Describe the experience/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /Traveler Profile/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Generate itinerary with AI/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Include lodging/i })).toBeDisabled()
  })

  it('allows AI Autobuild brief controls after title and location exist', () => {
    renderSetupPanel({
      title: 'Best Cusco Weekend Itinerary',
      location: 'peru|cusco',
      generationBrief: 'Luxury food, ruins, and rooftop drinks.',
    })

    expect(screen.queryByText(/before writing or using the AI Autobuild brief/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Describe the experience/i)).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Traveler Profile/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Generate itinerary with AI/i })).not.toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Include lodging/i })).not.toBeDisabled()
  })
})
