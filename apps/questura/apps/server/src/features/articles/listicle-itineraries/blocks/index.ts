import { Block } from 'payload'
import { ItineraryAccommodationsBlock } from './ItineraryAccommodationsBlock'
import { ItineraryAttractionsBlock } from './ItineraryAttractionsBlock'
import { ItineraryDiningBlock } from './ItineraryDiningBlock'
import { ItineraryKeyLocationsBlock } from './ItineraryKeyLocationsBlock'
import { ItineraryNightlifeBlock } from './ItineraryNightlifeBlock'
import { ItineraryTourAgencyBlock } from './ItineraryTourAgencyBlock'

export {
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryDiningBlock,
  ItineraryKeyLocationsBlock,
  ItineraryNightlifeBlock,
  ItineraryTourAgencyBlock,
}

export const listicleItineraryBlocks: Block[] = [
  ItineraryDiningBlock,
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryNightlifeBlock,
  ItineraryKeyLocationsBlock,
  ItineraryTourAgencyBlock,
]
