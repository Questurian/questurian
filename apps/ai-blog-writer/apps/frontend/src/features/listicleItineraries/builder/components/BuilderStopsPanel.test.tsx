import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  RelatedItemOption
} from '../../types'
import { createEmptyDraft } from '../../storage'
import { BuilderStopsPanel } from './BuilderStopsPanel'

vi.mock('../../../../components/FeaturedImagePicker', () => ({
  FeaturedImagePicker: () => null
}))

vi.mock('../../../../shared/markdown-editor', () => ({
  MarkdownBlockEditor: ({
    value,
    onChange,
    placeholder,
    ariaLabel
  }: {
    value: string
    onChange: (nextValue: string) => void
    placeholder?: string
    ariaLabel?: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  )
}))

vi.mock('../../../../shared/builder/components/InstagramPickerModal', () => ({
  InstagramPickerModal: () => null
}))

vi.mock('../../../../shared/builder/components/PhotoPickerModal', () => ({
  PhotoPickerModal: () => null
}))

vi.mock('../../../../shared/builder/components/RelatedItemPickerModal', () => ({
  RelatedItemPickerModal: () => null
}))

function buildRelatedByBlockType(
  overrides: Partial<Record<ItineraryBlockType, RelatedItemOption[]>> = {}
): Record<ItineraryBlockType, RelatedItemOption[]> {
  return {
    'itinerary-dining': [],
    'itinerary-accommodations': [],
    'itinerary-where-staying': [],
    'itinerary-attractions': [],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
    'itinerary-tour-agency': [],
    ...overrides
  }
}

const relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]> =
  buildRelatedByBlockType()

const diningItems: RelatedItemOption[] = [
  {
    id: 201,
    title: 'Cafe Andino',
    location: 'Peru > Cusco',
    latitude: -13.531,
    longitude: -71.972
  },
  {
    id: 102,
    title: 'San Pedro Market',
    location: 'Peru > Cusco',
    latitude: '-13.522',
    longitude: '-71.982'
  }
]

const hotelItems: RelatedItemOption[] = [
  {
    id: 201,
    title: 'Hotel Sol',
    location: 'Peru > Cusco',
    latitude: -13.518,
    longitude: -71.974
  }
]

const attractionItems: RelatedItemOption[] = [
  {
    id: 301,
    title: 'Sacsayhuaman',
    location: 'Peru > Cusco',
    latitude: -13.509,
    longitude: -71.982
  }
]

const attractionItemsWithTours: RelatedItemOption[] = [
  {
    id: 301,
    title: 'Sacsayhuaman',
    location: 'Peru > Cusco',
    latitude: -13.509,
    longitude: -71.982,
    tours: [
      { id: 901, title: 'Sunrise Walking Tour', price: '$45' },
      { id: 902, title: 'Horseback Ride', price: '$60' },
      { id: 903, title: 'Night Stargazing' }
    ]
  }
]

const keyLocationItems: RelatedItemOption[] = [
  {
    id: 101,
    title: 'Cusco Airport',
    location: 'Peru > Cusco',
    latitude: -13.535,
    longitude: -71.943
  }
]

function buildManualTourAgencyItem(): ItineraryItemBlock {
  return {
    id: 'tour-stop-1',
    blockType: 'itinerary-tour-agency',
    item: null,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: 'Sacred Valley Day Tour',
    operator: 'Andes Routes',
    price: '',
    url: 'https://example.com/tours/sacred-valley',
    tourDuration: 1,
    startingPoint: {
      label: '',
      latitude: '',
      longitude: ''
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: 'Manual stop blurb',
    blurbJsonText: ''
  }
}

function buildAttractionItem(): ItineraryItemBlock {
  return {
    id: 'attraction-stop-1',
    blockType: 'itinerary-attractions',
    item: 301,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    title: '',
    operator: '',
    price: '',
    url: '',
    tourDuration: 1,
    startingPoint: {
      label: '',
      latitude: '',
      longitude: ''
    },
    keyLocations: [],
    image: null,
    instagramPost: null,
    blurbMarkdown: '',
    blurbJsonText: ''
  }
}

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  draft.title = 'Cusco Tour Plan'
  draft.location = 'peru|cusco'
  draft.locationRef = 1
  draft.step1_complete = true
  draft.step2_complete = true
  draft.header.introMarkdown = 'Intro copy'
  draft.days = [
    {
      ...draft.days[0],
      whereStaying: [],
      items: [buildManualTourAgencyItem()]
    }
  ]
  return draft
}

function buildDraftWithKeyLocations(): ListicleItineraryDraft {
  const base = buildDraft()
  return {
    ...base,
    days: [
      {
        ...base.days[0],
        items: [
          {
            ...buildManualTourAgencyItem(),
            keyLocations: [
              {
                id: 'existing-restaurant-row',
                source: 'existing',
                relatedCollection: 'dining',
                relatedItem: 201,
                title: '',
                latitude: '',
                longitude: ''
              },
              {
                id: 'manual-overlook-row',
                source: 'manual',
                relatedCollection: null,
                relatedItem: null,
                title: 'Manual overlook',
                latitude: '-13.51',
                longitude: '-71.97'
              }
            ]
          }
        ]
      }
    ]
  }
}

type HarnessProps = {
  initialDraft?: ListicleItineraryDraft
  relatedItems?: Record<ItineraryBlockType, RelatedItemOption[]>
  onStopBlurbAiAutoWrite?: (itemId: string) => Promise<void>
  onAddItem?: (insertIndex?: number) => void
}

function Harness({
  initialDraft = buildDraft(),
  relatedItems = relatedByBlockType,
  onStopBlurbAiAutoWrite = async () => {},
  onAddItem = () => {}
}: HarnessProps = {}) {
  const [draft, setDraft] = useState<ListicleItineraryDraft>(initialDraft)

  return (
    <BuilderStopsPanel
      draft={draft}
      activeDayIndex={0}
      locationRef={1}
      mediaAssets={[]}
      instagramPosts={[]}
      isLoadingRelated={false}
      relatedByBlockType={relatedItems}
      onAddWhereStaying={() => {}}
      onAddItem={onAddItem}
      onMoveItem={() => {}}
      onRemoveItem={() => {}}
      onUpdateItem={(itemId, updater) => {
        setDraft((current) => {
          const dayIdx = 0
          const day = current.days[dayIdx]
          if (!day) return current
          if (day.whereStaying.some((item) => item.id === itemId)) {
            const nextDays = [...current.days]
            nextDays[dayIdx] = {
              ...day,
              whereStaying: day.whereStaying.map((item) =>
                item.id === itemId ? updater(item) : item
              )
            }
            return { ...current, days: nextDays }
          }
          const nextDays = [...current.days]
          nextDays[dayIdx] = {
            ...day,
            items: day.items.map((item) =>
              item.id === itemId ? updater(item) : item
            )
          }
          return { ...current, days: nextDays }
        })
      }}
      onStopBlurbAiAutoWrite={onStopBlurbAiAutoWrite}
      onRefineStopReason={async (_itemId, roughReason) => ({
        reason: roughReason,
        fallback: false
      })}
      activeAiItemId={null}
      onComposeActiveDayBlurbs={() => {}}
      onComposeAllDayBlurbs={() => {}}
      composableDayCount={0}
      isComposingDayBlurbs={false}
      hasDayBlurbReport={false}
      onViewDayBlurbReport={() => {}}
      isLocked={false}
      onContinueStep3={() => {}}
      onUpdateStep3={() => {}}
      onSaveStep3={() => {}}
      onCancelStep3Update={() => {}}
    />
  )
}

describe('BuilderStopsPanel', () => {
  it('shows icon options and adds an editable preset moment badge', async () => {
    const user = userEvent.setup()

    render(<Harness />)

    expect(screen.queryByLabelText('Moment label')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Moment badge'))

    const listbox = screen.getByRole('listbox', {
      name: 'Moment badge options'
    })
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(30)
    expect(
      options.every((option) =>
        option.querySelector('.stl-moment-picker__icon > svg')
      )
    ).toBe(true)

    await user.click(within(listbox).getByRole('option', { name: 'Breakfast' }))

    expect(screen.getByLabelText('Moment label')).toHaveValue('Breakfast')

    await user.clear(screen.getByLabelText('Moment label'))
    await user.type(
      screen.getByLabelText('Moment label'),
      "Lima's classic breakfast"
    )

    expect(screen.getByLabelText('Moment label')).toHaveValue(
      "Lima's classic breakfast"
    )
  })

  it('inserts a stop at the clicked position via inline zones', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn()

    // buildDraft() has one stop and no lodging: a top zone (index 0) plus an
    // after-card zone (index 1).
    render(<Harness onAddItem={onAddItem} />)

    const insertButtons = screen.getAllByRole('button', { name: /^stop$/i })
    expect(insertButtons).toHaveLength(2)

    await user.click(insertButtons[0])
    expect(onAddItem).toHaveBeenLastCalledWith(0)

    await user.click(insertButtons[1])
    expect(onAddItem).toHaveBeenLastCalledWith(1)
  })

  it('renders no inline insert zones in the lodging section', () => {
    const draftWithLodgingOnly: ListicleItineraryDraft = {
      ...buildDraft(),
      days: [
        {
          ...buildDraft().days[0],
          whereStaying: [
            {
              ...buildManualTourAgencyItem(),
              id: 'lodging-1',
              blockType: 'itinerary-where-staying'
            }
          ],
          items: []
        }
      ]
    }

    render(<Harness initialDraft={draftWithLodgingOnly} />)

    expect(screen.queryByLabelText('Moment badge')).not.toBeInTheDocument()

    // The header "Add stop" button is named "Add stop", so an exact "Stop"
    // match isolates the inline insert zones — there should be none.
    expect(screen.queryAllByRole('button', { name: /^stop$/i })).toHaveLength(0)
  })

  it('does not auto-write when the stop blurb editor is clicked', () => {
    const onStopBlurbAiAutoWrite = vi.fn(async () => {})

    render(<Harness onStopBlurbAiAutoWrite={onStopBlurbAiAutoWrite} />)

    fireEvent.click(screen.getByRole('textbox', { name: /blurb for stop 1/i }))

    expect(onStopBlurbAiAutoWrite).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: /regenerate|auto write/i })
    )

    expect(onStopBlurbAiAutoWrite).toHaveBeenCalledTimes(1)
    expect(onStopBlurbAiAutoWrite).toHaveBeenCalledWith('tour-stop-1')
  })

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

  it('fills the starting point from an existing stop collection', async () => {
    const user = userEvent.setup()
    const relatedItems = buildRelatedByBlockType({
      'itinerary-dining': diningItems,
      'itinerary-accommodations': hotelItems,
      'itinerary-attractions': attractionItems,
      'itinerary-key-location': keyLocationItems
    })

    render(<Harness relatedItems={relatedItems} />)

    await user.click(
      screen.getByRole('button', { name: 'Choose Existing Stop' })
    )
    await user.click(screen.getByRole('radio', { name: /Hotel Sol/ }))
    await user.click(screen.getByRole('button', { name: 'Use Selected' }))

    expect(screen.getByLabelText('Label')).toHaveValue('Hotel Sol')
    expect(screen.getByLabelText('Latitude')).toHaveValue('-13.518')
    expect(screen.getByLabelText('Longitude')).toHaveValue('-71.974')
  })

  it('adds checked existing stops across collections without dropping manual route points', async () => {
    const user = userEvent.setup()
    const relatedItems = buildRelatedByBlockType({
      'itinerary-dining': diningItems,
      'itinerary-accommodations': hotelItems,
      'itinerary-attractions': attractionItems,
      'itinerary-key-location': keyLocationItems
    })

    render(
      <Harness
        initialDraft={buildDraftWithKeyLocations()}
        relatedItems={relatedItems}
      />
    )

    await user.click(
      screen.getByRole('button', { name: 'Select Existing Stops' })
    )
    expect(screen.getByRole('checkbox', { name: /Cafe Andino/ })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Hotel Sol/ }))
    await user.click(screen.getByRole('checkbox', { name: /Sacsayhuaman/ }))
    await user.click(screen.getByRole('button', { name: 'Save Selection' }))

    expect(screen.getByText('Cafe Andino')).toBeInTheDocument()
    expect(screen.getByText('Hotel Sol')).toBeInTheDocument()
    expect(screen.getByText('Sacsayhuaman')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Manual overlook')).toBeInTheDocument()
  })

  it('selects and reorders attraction tour picks through the modal', async () => {
    const user = userEvent.setup()
    const relatedItems = buildRelatedByBlockType({
      'itinerary-attractions': attractionItemsWithTours
    })
    const draft = buildDraft()
    draft.days = [
      { ...draft.days[0], whereStaying: [], items: [buildAttractionItem()] }
    ]

    render(<Harness initialDraft={draft} relatedItems={relatedItems} />)

    await user.click(screen.getByRole('button', { name: /select tours/i }))

    const modal = screen.getByRole('dialog', { name: 'Select Tour Picks' })
    expect(modal).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Night Stargazing' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Horseback Ride' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Sunrise Walking Tour' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Picks' }))

    expect(
      screen.queryByRole('dialog', { name: 'Select Tour Picks' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('2 tours selected')).toBeInTheDocument()
    expect(screen.getByText('#1').parentElement).toHaveTextContent(
      'Horseback Ride'
    )
    expect(screen.getByText('#2').parentElement).toHaveTextContent(
      'Sunrise Walking Tour'
    )

    await user.click(screen.getByRole('button', { name: /2 tours selected/i }))
    expect(
      screen.getByRole('checkbox', { name: 'Horseback Ride' })
    ).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'Horseback Ride' }))
    await user.click(screen.getByRole('button', { name: 'Save Picks' }))

    expect(screen.getByText('1 tour selected')).toBeInTheDocument()
    expect(screen.getByText('#1').parentElement).toHaveTextContent(
      'Sunrise Walking Tour'
    )
  })
})
