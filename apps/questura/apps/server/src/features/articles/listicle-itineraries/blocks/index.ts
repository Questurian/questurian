import { Block } from 'payload'
import { ItineraryAccommodationsBlock } from './ItineraryAccommodationsBlock'
import { ItineraryAttractionsBlock } from './ItineraryAttractionsBlock'
import { ItineraryDiningBlock } from './ItineraryDiningBlock'
import { ItineraryKeyLocationsBlock } from './ItineraryKeyLocationsBlock'
import { ItineraryNightlifeBlock } from './ItineraryNightlifeBlock'
import { ItineraryTourAgencyBlock } from './ItineraryTourAgencyBlock'
import { ItineraryWhereStayingBlock } from './ItineraryWhereStayingBlock'

export {
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryDiningBlock,
  ItineraryKeyLocationsBlock,
  ItineraryNightlifeBlock,
  ItineraryTourAgencyBlock,
  ItineraryWhereStayingBlock,
}

/** Stops only (dining, attractions, tour agency, etc.) — lodging lives in `whereStaying`. */
export const listicleItineraryStopBlocks: Block[] = [
  ItineraryDiningBlock,
  ItineraryAccommodationsBlock,
  ItineraryAttractionsBlock,
  ItineraryNightlifeBlock,
  ItineraryKeyLocationsBlock,
  ItineraryTourAgencyBlock,
]

export const listicleItineraryWhereStayingBlocks: Block[] = [ItineraryWhereStayingBlock]
