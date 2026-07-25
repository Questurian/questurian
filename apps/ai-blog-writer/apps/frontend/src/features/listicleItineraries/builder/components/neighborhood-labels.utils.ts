import type { LocationOption } from '../../types'
import { formatLocationLabel } from '../../../../shared/locationScope/labels'

export function getSharedNeighborhoodsTriggerLabel(
  selectedIds: number[],
  neighborhoodOptions: LocationOption[],
): string {
  if (selectedIds.length === 0) return 'City-wide (no filter)'
  if (selectedIds.length === 1) {
    const match = neighborhoodOptions.find((location) => location.id === selectedIds[0])
    return match ? formatNeighborhoodChipLabel(match) : '1 neighborhood selected'
  }
  return `${selectedIds.length} neighborhoods selected`
}

export function formatNeighborhoodChipLabel(location: LocationOption): string {
  const neighborhood = location.neighborhood?.trim()
  if (neighborhood) {
    return neighborhood
      .split(/[\s_-]+/g)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const parts = formatLocationLabel(location).split(' > ')
  return parts[parts.length - 1] ?? formatLocationLabel(location)
}
