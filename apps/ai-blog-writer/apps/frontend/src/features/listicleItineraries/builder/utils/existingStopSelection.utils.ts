import { getRelatedItemDisplayLabel } from '../../../../shared/related-items/normalizeRelatedItems'
import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  RelatedItemCollection,
  RelatedItemOption,
  TourAgencyKeyLocationRow,
  TourAgencyStartingPoint,
} from '../../types'
import { relatedCollectionToBlockType } from '../../types'
import type { ExistingStopPickerOption } from '../components/ExistingStopPickerModal'
import { createKeyLocationRow } from './itineraryStopBlock.utils'

export const TOUR_AGENCY_EXISTING_STOP_COLLECTION_OPTIONS: Array<{
  value: RelatedItemCollection
  label: string
}> = [
  { value: 'dining', label: 'Dining' },
  { value: 'accommodations', label: 'Hotels' },
  { value: 'attractions', label: 'Attractions' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'key-locations', label: 'Key Locations' },
]

export function getRelatedItemsForCollection(
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  collection: RelatedItemCollection | null,
): RelatedItemOption[] {
  if (!collection) return []
  return relatedByBlockType[relatedCollectionToBlockType(collection)] || []
}

export function buildExistingStopSelectionKey(
  collection: RelatedItemCollection,
  itemId: number,
): string {
  return `${collection}:${itemId}`
}

export function toCoordinateText(value: number | string | null | undefined): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  return typeof value === 'string' ? value : ''
}

export function canUseExistingItemAsStartingPoint(item: RelatedItemOption): boolean {
  const latitude = toCoordinateText(item.latitude).trim()
  const longitude = toCoordinateText(item.longitude).trim()
  return Boolean(
    latitude
    && longitude
    && Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude)),
  )
}

export function buildExistingStopOptions(
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): ExistingStopPickerOption[] {
  return TOUR_AGENCY_EXISTING_STOP_COLLECTION_OPTIONS.flatMap(({ value, label }) => (
    getRelatedItemsForCollection(relatedByBlockType, value).map((item) => ({
      selectionKey: buildExistingStopSelectionKey(value, item.id),
      collection: value,
      collectionLabel: label,
      item,
      canUseAsStartingPoint: canUseExistingItemAsStartingPoint(item),
    }))
  ))
}

export function buildStartingPointFromExistingStop(
  item: RelatedItemOption,
): TourAgencyStartingPoint {
  return {
    label: getRelatedItemDisplayLabel(item),
    latitude: toCoordinateText(item.latitude),
    longitude: toCoordinateText(item.longitude),
  }
}

function normalizeTextForCompare(value: string): string {
  return value.trim().toLowerCase()
}

export function getSelectedStartingPointExistingStopKey(
  startingPoint: TourAgencyStartingPoint,
  existingStopOptions: ExistingStopPickerOption[],
): string | null {
  const label = normalizeTextForCompare(startingPoint.label)
  if (!label) return null

  const latitude = startingPoint.latitude.trim()
  const longitude = startingPoint.longitude.trim()
  const match = existingStopOptions.find((option) => {
    if (!option.canUseAsStartingPoint) return false
    const optionStartingPoint = buildStartingPointFromExistingStop(option.item)
    const optionLabel = normalizeTextForCompare(optionStartingPoint.label)
    if (optionLabel !== label) return false

    const optionLatitude = optionStartingPoint.latitude.trim()
    const optionLongitude = optionStartingPoint.longitude.trim()
    if (!latitude && !longitude) return true
    return optionLatitude === latitude && optionLongitude === longitude
  })

  return match?.selectionKey ?? null
}

export function getExistingRouteSelectionKey(
  location: TourAgencyKeyLocationRow,
): string | null {
  if (
    location.source !== 'existing'
    || !location.relatedCollection
    || typeof location.relatedItem !== 'number'
  ) {
    return null
  }

  return buildExistingStopSelectionKey(location.relatedCollection, location.relatedItem)
}

export function getSelectedExistingRouteKeys(item: ItineraryItemBlock): string[] {
  return item.keyLocations
    .map((location) => getExistingRouteSelectionKey(location))
    .filter((selectionKey): selectionKey is string => Boolean(selectionKey))
}

export function findExistingStopOptionForRow(
  existingStopOptions: ExistingStopPickerOption[],
  location: TourAgencyKeyLocationRow,
): ExistingStopPickerOption | null {
  const selectionKey = getExistingRouteSelectionKey(location)
  if (!selectionKey) return null
  return existingStopOptions.find((option) => option.selectionKey === selectionKey) || null
}

export function buildRoutePointRowsFromSelection(
  item: ItineraryItemBlock,
  selectedKeys: string[],
  existingStopOptions: ExistingStopPickerOption[],
): TourAgencyKeyLocationRow[] {
  const availableKeys = new Set(existingStopOptions.map((option) => option.selectionKey))
  const selectedKeySet = new Set(selectedKeys)
  const nextRows: TourAgencyKeyLocationRow[] = []

  item.keyLocations.forEach((location) => {
    const selectionKey = getExistingRouteSelectionKey(location)
    if (!selectionKey) {
      nextRows.push(location)
      return
    }

    if (!availableKeys.has(selectionKey)) {
      nextRows.push(location)
      return
    }

    if (selectedKeySet.has(selectionKey)) {
      nextRows.push(location)
      selectedKeySet.delete(selectionKey)
    }
  })

  selectedKeys.forEach((selectionKey) => {
    if (!selectedKeySet.has(selectionKey)) return
    const selectedOption = existingStopOptions.find((option) => option.selectionKey === selectionKey)
    if (!selectedOption) return

    nextRows.push({
      ...createKeyLocationRow(item.id, 'existing'),
      relatedCollection: selectedOption.collection,
      relatedItem: selectedOption.item.id,
    })
  })

  return nextRows
}
