import { createEmptyDraft } from '../../storage'
import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'
import {
  addItineraryStop,
  addWhereStayingItem,
  createEmptyItineraryStop,
  createEmptyWhereStayingItem
} from './itinerary-item-creation.actions'
import { updateItineraryItem } from './itinerary-item-mutation.actions'
import { moveItineraryItem } from './itinerary-item-ordering.actions'
import { removeItineraryItem } from './itinerary-item-removal.actions'

function buildItem(
  id: string,
  overrides: Partial<ItineraryItemBlock> = {}
): ItineraryItemBlock {
  return {
    ...createEmptyItineraryStop(() => id),
    item: 101,
    selectionReason: `${id} reason`,
    blurbMarkdown: `${id} blurb`,
    blurbJsonText: `${id} json`,
    blurbLexical: { root: {} } as never,
    ...overrides
  }
}

function buildDraft(): ListicleItineraryDraft {
  const draft = createEmptyDraft()
  return {
    ...draft,
    dayCount: 2,
    days: [
      {
        id: 'day-1',
        whereStaying: [
          buildItem('lodging-1', {
            blockType: 'itinerary-where-staying',
            item: 201
          }),
          buildItem('lodging-2', {
            blockType: 'itinerary-where-staying',
            item: 202
          })
        ],
        items: [buildItem('stop-1'), buildItem('stop-2', { item: 102 })]
      },
      {
        id: 'day-2',
        whereStaying: [],
        items: [buildItem('stop-3', { item: 103 })]
      }
    ]
  }
}

describe('itinerary item creation actions', () => {
  it('creates ordinary and lodging rows with deterministic stable ids', () => {
    const stop = createEmptyItineraryStop(() => 'new-stop')
    const lodging = createEmptyWhereStayingItem(() => 'new-lodging')

    expect(stop).toMatchObject({
      id: 'new-stop',
      blockType: 'itinerary-dining',
      item: null,
      selectionReason: ''
    })
    expect(lodging).toMatchObject({
      id: 'new-lodging',
      blockType: 'itinerary-where-staying',
      item: null,
      selectionReason: ''
    })
  })

  it.each([
    { insertIndex: undefined, expectedIds: ['stop-1', 'stop-2', 'new-stop'] },
    { insertIndex: -50, expectedIds: ['new-stop', 'stop-1', 'stop-2'] },
    { insertIndex: 50, expectedIds: ['stop-1', 'stop-2', 'new-stop'] }
  ])('clamps insertion index $insertIndex', ({ insertIndex, expectedIds }) => {
    const draft = addItineraryStop(buildDraft(), 0, insertIndex, () =>
      buildItem('new-stop')
    )

    expect(draft.days[0].items.map((item) => item.id)).toEqual(expectedIds)
  })

  it('does not allocate an id when the target day is missing', () => {
    const draft = buildDraft()
    const createItem = vi.fn(() => buildItem('unused'))

    const next = addItineraryStop(draft, 99, undefined, createItem)

    expect(next).toBe(draft)
    expect(createItem).not.toHaveBeenCalled()
  })

  it('appends lodging without changing ordinary stop order', () => {
    const draft = addWhereStayingItem(buildDraft(), 0, () =>
      createEmptyWhereStayingItem(() => 'lodging-3')
    )

    expect(draft.days[0].whereStaying.map((item) => item.id)).toEqual([
      'lodging-1',
      'lodging-2',
      'lodging-3'
    ])
    expect(draft.days[0].items.map((item) => item.id)).toEqual([
      'stop-1',
      'stop-2'
    ])
  })
})

describe('itinerary item mutation actions', () => {
  it('updates lodging and invalidates copy when its related identity changes', () => {
    const draft = updateItineraryItem(buildDraft(), 'lodging-1', (item) => ({
      ...item,
      item: 999
    }))
    const lodging = draft.days[0].whereStaying[0]

    expect(lodging.item).toBe(999)
    expect(lodging.selectionReason).toBe('')
    expect(lodging.blurbMarkdown).toBe('')
    expect(lodging.blurbJsonText).toBe('')
    expect(lodging.blurbLexical).toBeUndefined()
    expect(draft.days[0].items[0].selectionReason).toBe('stop-1 reason')
  })

  it('invalidates manual-tour copy when title or operator changes', () => {
    const draft = buildDraft()
    draft.days[0].items[0] = buildItem('manual', {
      blockType: 'itinerary-tour-agency',
      item: null,
      title: 'Old title',
      operator: 'Old operator'
    })

    const next = updateItineraryItem(draft, 'manual', (item) => ({
      ...item,
      operator: 'New operator'
    }))

    expect(next.days[0].items[0].operator).toBe('New operator')
    expect(next.days[0].items[0].selectionReason).toBe('')
    expect(next.days[0].items[0].blurbMarkdown).toBe('')
  })

  it('preserves copy and sibling identities for non-identity edits', () => {
    const draft = buildDraft()
    const originalSibling = draft.days[0].items[1]

    const next = updateItineraryItem(draft, 'stop-1', (item) => ({
      ...item,
      price: '$$$'
    }))

    expect(next.days[0].items[0].price).toBe('$$$')
    expect(next.days[0].items[0].selectionReason).toBe('stop-1 reason')
    expect(next.days[0].items[0].blurbMarkdown).toBe('stop-1 blurb')
    expect(next.days[0].items[1]).toBe(originalSibling)
  })

  it('keeps lodging precedence when malformed data repeats an id', () => {
    const draft = buildDraft()
    draft.days[0].items[0] = buildItem('lodging-1', { item: 303 })

    const next = updateItineraryItem(draft, 'lodging-1', (item) => ({
      ...item,
      price: '$$'
    }))

    expect(next.days[0].whereStaying[0].price).toBe('$$')
    expect(next.days[0].items[0].price).toBe('')
  })
})

describe('itinerary item removal actions', () => {
  it('removes from the resolved collection without affecting other days', () => {
    const draft = buildDraft()
    const dayTwo = draft.days[1]

    const withoutLodging = removeItineraryItem(draft, 'lodging-1')
    const withoutStop = removeItineraryItem(withoutLodging, 'stop-2')

    expect(withoutStop.days[0].whereStaying.map((item) => item.id)).toEqual([
      'lodging-2'
    ])
    expect(withoutStop.days[0].items.map((item) => item.id)).toEqual(['stop-1'])
    expect(withoutStop.days[1]).toBe(dayTwo)
  })

  it('removes only lodging when malformed data repeats an id', () => {
    const draft = buildDraft()
    draft.days[0].items[0] = buildItem('lodging-1')

    const next = removeItineraryItem(draft, 'lodging-1')

    expect(next.days[0].whereStaying.map((item) => item.id)).toEqual([
      'lodging-2'
    ])
    expect(next.days[0].items[0].id).toBe('lodging-1')
  })
})

describe('itinerary item ordering actions', () => {
  it('moves ordinary stops while preserving their stable ids and objects', () => {
    const draft = buildDraft()
    const movedStop = draft.days[0].items[0]

    const next = moveItineraryItem(draft, 'stop-1', 'down')

    expect(next.days[0].items.map((item) => item.id)).toEqual([
      'stop-2',
      'stop-1'
    ])
    expect(next.days[0].items[1]).toBe(movedStop)
    expect(next.days[0].whereStaying).toBe(draft.days[0].whereStaying)
  })

  it('moves lodging only within the lodging collection', () => {
    const draft = moveItineraryItem(buildDraft(), 'lodging-2', 'up')

    expect(draft.days[0].whereStaying.map((item) => item.id)).toEqual([
      'lodging-2',
      'lodging-1'
    ])
    expect(draft.days[0].items.map((item) => item.id)).toEqual([
      'stop-1',
      'stop-2'
    ])
  })

  it('does not cross collection or day boundaries', () => {
    const draft = buildDraft()

    const lodgingAtTop = moveItineraryItem(draft, 'lodging-1', 'up')
    const stopAtBottom = moveItineraryItem(draft, 'stop-2', 'down')
    const onlyStopOnDayTwo = moveItineraryItem(draft, 'stop-3', 'up')

    expect(lodgingAtTop.days[0]).toBe(draft.days[0])
    expect(stopAtBottom.days[0]).toBe(draft.days[0])
    expect(onlyStopOnDayTwo.days[1]).toBe(draft.days[1])
  })
})
