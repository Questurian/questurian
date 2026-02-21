/**
 * Location Filter Utility for Rankings Blocks
 *
 * This utility provides location-based filtering for relationship fields in ranking blocks.
 * It filters data collection items (dining, accommodations, attractions, nightlife) to only
 * show items that match the parent Rankings document's location field.
 *
 * How It Works:
 * 1. Reads the parent document's location field via Payload's filterOptions API
 * 2. If location is set, returns a where constraint to filter by exact location match
 * 3. If no location is set, returns true (no filter - show all items)
 * 4. Includes extensive console logging for debugging
 *
 * Usage:
 * Import this in block definitions and add to relationship field:
 *
 * import { createLocationFilter } from './utils/locationFilter'
 *
 * {
 *   name: 'item',
 *   type: 'relationship',
 *   relationTo: 'dining',
 *   filterOptions: createLocationFilter('dining'),
 * }
 */

import type { FilterOptionsProps, Where } from 'payload'

/**
 * Creates a location-based filter function for relationship fields
 *
 * @param collectionName - The name of the collection being filtered (for logging)
 * @returns A filter function compatible with Payload's filterOptions API
 */
export const createLocationFilter = (collectionName: string) => {
  return ({ data, siblingData, req }: FilterOptionsProps): Where => {
    // Extract parent document's location field
    const parentLocation = data?.location as string | undefined

    // ========== EXTENSIVE LOGGING ==========
    console.log(`[${collectionName} filterOptions] ========== START ==========`)
    console.log(`[${collectionName} filterOptions] Parent location:`, parentLocation)
    console.log(`[${collectionName} filterOptions] Sibling data:`, siblingData)
    console.log(`[${collectionName} filterOptions] Parent data keys:`, Object.keys(data || {}))

    // If no location is set, still filter out drafts
    if (!parentLocation) {
      console.log(
        `[${collectionName} filterOptions] No location set - filtering only published items`,
      )
      console.log(`[${collectionName} filterOptions] ========== END ==========`)
      return {
        status: { equals: 'published' },
      } satisfies Where
    }

    // Create where constraint to filter by exact location match AND published status
    const whereConstraint: Where = {
      and: [
        { location: { equals: parentLocation } },
        { status: { equals: 'published' } },
      ],
    }

    console.log(
      `[${collectionName} filterOptions] Applying where constraint:`,
      JSON.stringify(whereConstraint),
    )
    console.log(`[${collectionName} filterOptions] ========== END ==========`)

    return whereConstraint
  }
}

export const createPlaceLocationFilter = () => createLocationFilter('places')
