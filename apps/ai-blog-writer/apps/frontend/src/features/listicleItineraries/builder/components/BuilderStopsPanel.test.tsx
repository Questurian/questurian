import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ItineraryBlockType, ItineraryItemBlock, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import { createEmptyDraft } from '../../storage'
import { BuilderStopsPanel } from './BuilderStopsPanel'

vi.mock('../../../../components/FeaturedImagePicker', () => ({
  FeaturedImagePicker: () => null,
}))

vi.mock('../../../staging/features/markdown-editor', () => ({
  MarkdownBlockEditor: () => null,
}))

vi.mock('./InstagramPickerModal', () => ({
  InstagramPickerModal: () => null,
}))

vi.mock('./PhotoPickerModal', () => ({
  PhotoPickerModal: () => null,
}))

vi.mock('./RelatedItemPickerModal', () => ({
  RelatedItemPickerModal: () => null,
}))

const relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]> = {
  'itinerary-dining': [],
  'itinerary-accommodations': [],
  'itinerary-attractions': [],
  'itinerary-nightlife': [],
  'itinerary-key-location': [],
  'itinerary-tour-agency': [],
}

function buildManualTourAgencyItem(): ItineraryItemBlock {
  return {
    id: 'tour-stop-1',
    blockType: 'itinerary-tour-agency',
    item: null,
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    timeHour: 9,
    timeMinute: '00',
    timePeriod: 'AM',
    durationHours: 2,
    durationMinutes: '0',
    title: 'Sacred Valley Day Tour',
    operator: 'Andes Routes',
    price: '',
    url: 'https://example.com/tours/sacred-valley',
    tourDuration: 1,
    startingPoint: {
      label: '',
      latitude: '',
      longitude: '',
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: 'Manual stop blurb',
    blurbJsonText: '',
  }
}

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.title = 'Cusco Tour Plan'
  draft.location = 'peru|cusco'
  draft.locationRef = 1
  draft.dayAudience = 'anyday'
  draft.step1_complete = true
  draft.step2_complete = true
  draft.header.introMarkdown = 'Intro copy'
  draft.items = [buildManualTourAgencyItem()]
  return draft
}

function Harness() {
  const [draft, setDraft] = useState<ListicleItineraryDraft>(buildDraft())

  return (
    <BuilderStopsPanel
      draft={draft}
      token={null}
      locationRef={1}
      mediaAssets={[]}
      instagramPosts={[]}
      isLoadingRelated={false}
      relatedByBlockType={relatedByBlockType}
      onAddItem={() => {}}
      onEndHereOnLastStop={() => {}}
      onMoveItem={() => {}}
      onRemoveItem={() => {}}
      onUpdateItem={(itemId, updater) => {
        setDraft((current) => ({
          ...current,
          items: current.items.map((item) => (item.id === itemId ? updater(item) : item)),
        }))
      }}
      onStopBlurbAiAutoWrite={async () => {}}
      onStopBlurbAiRewrite={async () => ''}
      activeAiItemId={null}
      isLocked={false}
      onContinueStep3={() => {}}
      onUpdateStep3={() => {}}
      onSaveStep3={() => {}}
      onCancelStep3Update={() => {}}
    />
  )
}

describe('BuilderStopsPanel', () => {
  it('updates manual tour-agency price, duration, and starting-point fields', async () => {
    const user = userEvent.setup()

    render(<Harness />)

    await user.selectOptions(screen.getByLabelText('Price'), '$$$')
    expect(screen.getByLabelText('Price')).toHaveValue('$$$')

    const durationSlider = screen.getByLabelText('Tour Duration')
    fireEvent.change(durationSlider, { target: { value: '8' } })
    expect(durationSlider).toHaveValue('8')
    expect(screen.getByText('8 hours')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Label'), 'Plaza de Armas')
    await user.type(screen.getByLabelText('Latitude'), '-13.516')
    await user.type(screen.getByLabelText('Longitude'), '-71.978')

    expect(screen.getByLabelText('Label')).toHaveValue('Plaza de Armas')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-13.516')
    expect(screen.getByLabelText('Longitude')).toHaveValue('-71.978')
  })
})
