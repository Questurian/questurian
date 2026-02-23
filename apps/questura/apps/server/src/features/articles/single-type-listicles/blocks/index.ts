import { Block } from 'payload'
import { DataDiningBlock } from './DataDiningBlock'
import { DataAccommodationsBlock } from './DataAccommodationsBlock'
import { DataAttractionsBlock } from './DataAttractionsBlock'
import { DataNightlifeBlock } from './DataNightlifeBlock'

export { DataDiningBlock, DataAccommodationsBlock, DataAttractionsBlock, DataNightlifeBlock }

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
