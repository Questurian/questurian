import type { ItineraryBlockType } from '../../types'

export const ITINERARY_STOP_SCHEMA_TYPE: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'Restaurant',
  'itinerary-accommodations': 'LodgingBusiness',
  'itinerary-where-staying': 'LodgingBusiness',
  'itinerary-attractions': 'TouristAttraction',
  'itinerary-nightlife': 'NightClub',
  'itinerary-key-location': 'Place',
  'itinerary-tour-agency': 'TouristTrip'
}

const ITINERARY_STOP_ALLOWED_SCHEMA_TYPES: Record<
  ItineraryBlockType,
  string[]
> = {
  'itinerary-dining': [
    'Restaurant',
    'FoodEstablishment',
    'CafeOrCoffeeShop',
    'IceCreamShop',
    'Bakery',
    'FastFoodRestaurant'
  ],
  'itinerary-accommodations': [
    'LodgingBusiness',
    'Hotel',
    'Hostel',
    'BedAndBreakfast',
    'Resort'
  ],
  'itinerary-where-staying': [
    'LodgingBusiness',
    'Hotel',
    'Hostel',
    'BedAndBreakfast',
    'Resort'
  ],
  'itinerary-attractions': ['TouristAttraction', 'Place'],
  'itinerary-nightlife': [
    'NightClub',
    'BarOrPub',
    'EntertainmentBusiness',
    'LocalBusiness'
  ],
  'itinerary-key-location': ['Place', 'LocalBusiness'],
  'itinerary-tour-agency': ['TouristTrip', 'Trip', 'Service', 'TravelAgency']
}

export function getItineraryStopTypeLabel(
  blockType: ItineraryBlockType
): string {
  switch (blockType) {
    case 'itinerary-dining':
      return 'Dining'
    case 'itinerary-accommodations':
      return 'Accommodations'
    case 'itinerary-where-staying':
      return "Where You're Staying"
    case 'itinerary-attractions':
      return 'Attractions'
    case 'itinerary-nightlife':
      return 'Nightlife'
    case 'itinerary-key-location':
      return 'Key Location'
    case 'itinerary-tour-agency':
      return 'Tour Agency'
    default:
      return 'Stop'
  }
}

export function getSchemaTypeForItineraryBlockType(
  blockType: ItineraryBlockType
): string {
  return ITINERARY_STOP_SCHEMA_TYPE[blockType] || 'Place'
}

export function getAllowedSchemaTypesForItineraryBlockType(
  blockType: ItineraryBlockType
): string[] {
  return ITINERARY_STOP_ALLOWED_SCHEMA_TYPES[blockType] || ['Place']
}
