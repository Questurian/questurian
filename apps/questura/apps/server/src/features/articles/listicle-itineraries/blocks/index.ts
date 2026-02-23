import { Block } from 'payload'
import { ItineraryAccommodationsBlock } from './ItineraryAccommodationsBlock'
import { ItineraryAttractionsBlock } from './ItineraryAttractionsBlock'
import { ItineraryDiningBlock } from './ItineraryDiningBlock'
import { ItineraryKeyLocationsBlock } from './ItineraryKeyLocationsBlock'
import { ItineraryNightlifeBlock } from './ItineraryNightlifeBlock'

export {
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryDiningBlock,
  ItineraryKeyLocationsBlock,
  ItineraryNightlifeBlock,
}

export const listicleItineraryBlocks: Block[] = [
  ItineraryDiningBlock,
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryNightlifeBlock,
  ItineraryKeyLocationsBlock,
]
