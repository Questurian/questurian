import { Block } from 'payload'
import { createDataListicleBlock } from './createDataListicleBlock'

export const DataDiningBlock = createDataListicleBlock({
  slug: 'data-dining',
  relationTo: 'dining',
  singular: 'Dining Item',
  plural: 'Dining Items',
  itemDescription: 'Select a dining listing for this ranked item',
})

export const DataAccommodationsBlock = createDataListicleBlock({
  slug: 'data-accommodations',
  relationTo: 'accommodations',
  singular: 'Accommodation Item',
  plural: 'Accommodation Items',
  itemDescription: 'Select an accommodation listing for this ranked item',
})

export const DataAttractionsBlock = createDataListicleBlock({
  slug: 'data-attractions',
  relationTo: 'attractions',
  singular: 'Attraction Item',
  plural: 'Attraction Items',
  itemDescription: 'Select an attraction listing for this ranked item',
})

export const DataNightlifeBlock = createDataListicleBlock({
  slug: 'data-nightlife',
  relationTo: 'nightlife',
  singular: 'Nightlife Item',
  plural: 'Nightlife Items',
  itemDescription: 'Select a nightlife listing for this ranked item',
})

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
