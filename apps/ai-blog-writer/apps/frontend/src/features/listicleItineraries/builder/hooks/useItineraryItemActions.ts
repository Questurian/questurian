import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'
import {
  addItineraryStop,
  addWhereStayingItem as appendWhereStayingItem
} from '../actions/itinerary-item-creation.actions'
import {
  updateItineraryItem,
  type ItineraryItemUpdater
} from '../actions/itinerary-item-mutation.actions'
import {
  moveItineraryItem,
  type ItineraryItemMoveDirection
} from '../actions/itinerary-item-ordering.actions'
import { removeItineraryItem } from '../actions/itinerary-item-removal.actions'

type SetItineraryDraft = Dispatch<SetStateAction<ListicleItineraryDraft | null>>

export type ItineraryItemActions = {
  updateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: ItineraryItemMoveDirection) => void
  addItem: (dayIndex: number, insertIndex?: number) => void
  addWhereStayingItem: (dayIndex: number) => void
}

/** Adapt pure itinerary-item transforms to React's functional state updates. */
export function useItineraryItemActions(
  setDraft: SetItineraryDraft
): ItineraryItemActions {
  const updateItem = useCallback(
    (itemId: string, updater: ItineraryItemUpdater) => {
      setDraft((current) =>
        current ? updateItineraryItem(current, itemId, updater) : current
      )
    },
    [setDraft]
  )

  const removeItem = useCallback(
    (itemId: string) => {
      setDraft((current) =>
        current ? removeItineraryItem(current, itemId) : current
      )
    },
    [setDraft]
  )

  const moveItem = useCallback(
    (itemId: string, direction: ItineraryItemMoveDirection) => {
      setDraft((current) =>
        current ? moveItineraryItem(current, itemId, direction) : current
      )
    },
    [setDraft]
  )

  const addItem = useCallback(
    (dayIndex: number, insertIndex?: number) => {
      setDraft((current) =>
        current ? addItineraryStop(current, dayIndex, insertIndex) : current
      )
    },
    [setDraft]
  )

  const addWhereStayingItem = useCallback(
    (dayIndex: number) => {
      setDraft((current) =>
        current ? appendWhereStayingItem(current, dayIndex) : current
      )
    },
    [setDraft]
  )

  return {
    updateItem,
    removeItem,
    moveItem,
    addItem,
    addWhereStayingItem
  }
}
