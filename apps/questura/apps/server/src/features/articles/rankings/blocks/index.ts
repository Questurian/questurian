/**
 * Ranking Blocks
 * Block definitions and utility functions for Rankings collection
 */

import { Block } from 'payload'
import { DataDiningBlock } from './DataDiningBlock'
import { DataAccommodationsBlock } from './DataAccommodationsBlock'
import { DataAttractionsBlock } from './DataAttractionsBlock'
import { DataNightlifeBlock } from './DataNightlifeBlock'

// Export data blocks
export {
  DataDiningBlock,
  DataAccommodationsBlock,
  DataAttractionsBlock,
  DataNightlifeBlock,
}

/**
 * Get available blocks for a specific ranking type
 * Maps ranking type to corresponding block definition
 *
 * @param type - The ranking type (dining, accommodations, attractions, nightlife)
 * @returns Array of Block definitions for the type
 */
export const getBlocksForType = (type?: string): Block[] => {
  switch (type) {
    case 'dining':
      return [DataDiningBlock]
    case 'accommodations':
      return [DataAccommodationsBlock]
    case 'attractions':
      return [DataAttractionsBlock]
    case 'nightlife':
      return [DataNightlifeBlock]
    default:
      return []
  }
}
