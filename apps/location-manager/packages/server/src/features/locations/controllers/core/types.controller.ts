import type { Context } from "hono";
import { DINING_ESTABLISHMENT_TYPES } from "@shared/types/dining-taxonomy";

interface TypeOption {
  label: string;
  value: string;
}

const ACCOMMODATIONS_TYPES: TypeOption[] = [
  { label: "Hotel", value: "hotel" },
  { label: "Hostel", value: "hostel" },
  { label: "Resort", value: "resort" },
  { label: "Vacation Rental", value: "vacation-rental" },
  { label: "Villa", value: "villa" },
  { label: "Guesthouse", value: "guesthouse" },
  { label: "Boutique", value: "boutique" },
  { label: "Budget", value: "budget" },
];

const ATTRACTIONS_TYPES: TypeOption[] = [
  { label: "Museum", value: "museum" },
  { label: "Gallery", value: "gallery" },
  { label: "Library", value: "library" },
  { label: "Cultural Center", value: "cultural-center" },
  { label: "Park", value: "park" },
  { label: "National Park", value: "national-park" },
  { label: "Botanical Garden", value: "botanical-garden" },
  { label: "Beach", value: "beach" },
  { label: "Island", value: "island" },
  { label: "Viewpoint", value: "viewpoint" },
  { label: "Waterfall", value: "waterfall" },
  { label: "Cave", value: "cave" },
  { label: "Hot Springs", value: "hot-springs" },
  { label: "Promenade", value: "promenade" },
  { label: "Walking Trail", value: "walking-trail" },
  { label: "Bike Trail", value: "bike-trail" },
  { label: "Hiking Trail", value: "hiking-trail" },
  { label: "Scenic Route", value: "scenic-route" },
  { label: "Historical Site", value: "historical-site" },
  { label: "Archaeological Site", value: "archaeological-site" },
  { label: "Ruins", value: "ruins" },
  { label: "Church", value: "church" },
  { label: "Cathedral", value: "cathedral" },
  { label: "Temple", value: "temple" },
  { label: "Landmark", value: "landmark" },
  { label: "Monument", value: "monument" },
  { label: "Memorial", value: "memorial" },
  { label: "Palace", value: "palace" },
  { label: "Fortress", value: "fortress" },
  { label: "Bridge", value: "bridge" },
  { label: "Lighthouse", value: "lighthouse" },
  { label: "Plaza", value: "plaza" },
  { label: "Market", value: "market" },
  { label: "Shopping", value: "shopping" },
  { label: "Shopping Center", value: "shopping-center" },
  { label: "Mall", value: "mall" },
  { label: "Boardwalk", value: "boardwalk" },
  { label: "Entertainment", value: "entertainment" },
  { label: "Stadium", value: "stadium" },
  { label: "Observatory", value: "observatory" },
  { label: "Zoo", value: "zoo" },
  { label: "Aquarium", value: "aquarium" },
  { label: "Adventure Park", value: "adventure-park" },
  { label: "Theme Park", value: "theme-park" },
  { label: "Workshop/Class", value: "workshop-class" },
];

const NIGHTLIFE_TYPES: TypeOption[] = [
  { label: "Bar", value: "bar" },
  { label: "Cocktail Bar", value: "cocktail-bar" },
  { label: "Sports Bar", value: "sports-bar" },
  { label: "Tavern", value: "tavern" },
  { label: "Dive Bar", value: "dive-bar" },
  { label: "Wine Bar", value: "wine-bar" },
  { label: "Whiskey Bar", value: "whiskey-bar" },
  { label: "Karaoke Bar", value: "karaoke-bar" },
  { label: "Brewpub", value: "brewpub" },
  { label: "Pub", value: "pub" },
  { label: "Speakeasy", value: "speakeasy" },
  { label: "Nightclub", value: "nightclub" },
  { label: "Lounge", value: "lounge" },
  { label: "Live Music", value: "live-music" },
  { label: "Dance Club", value: "dance-club" },
  { label: "Rooftop", value: "rooftop" },
];

const KEY_LOCATIONS_TYPES: TypeOption[] = [
  { label: "Airport", value: "airport" },
  { label: "Train Station", value: "train_station" },
  { label: "Metro Station", value: "metro_station" },
  { label: "Bus Stop", value: "bus_stop" },
  { label: "Bus Terminal", value: "bus_terminal" },
  { label: "Ferry Terminal", value: "ferry_terminal" },
  { label: "Cruise Terminal", value: "cruise_terminal" },
  { label: "Taxi Stand", value: "taxi_stand" },
  { label: "Car Rental", value: "car_rental" },
  { label: "Parking Garage", value: "parking_garage" },
  { label: "Gas Station", value: "gas_station" },
  { label: "EV Charging Station", value: "ev_charging_station" },
  { label: "Currency Exchange", value: "currency_exchange" },
  { label: "Bank Branch", value: "bank_branch" },
  { label: "ATM", value: "atm" },
  { label: "SIM Card / Mobile Store", value: "mobile_store" },
  { label: "Post Office", value: "post_office" },
  { label: "Embassy", value: "embassy" },
  { label: "Consulate", value: "consulate" },
  { label: "Immigration Office", value: "immigration_office" },
  { label: "Government Office", value: "government_office" },
  { label: "Police Station", value: "police_station" },
  { label: "Hospital", value: "hospital" },
  { label: "Clinic", value: "clinic" },
  { label: "Urgent Care", value: "urgent_care" },
  { label: "Doctor's Office", value: "doctor_office" },
  { label: "Pharmacy", value: "pharmacy" },
  { label: "Grocery Store", value: "grocery_store" },
  { label: "Supermarket", value: "supermarket" },
  { label: "Convenience Store", value: "convenience_store" },
  { label: "Laundromat", value: "laundromat" },
  { label: "Coworking Space", value: "coworking_space" },
  { label: "Business Center", value: "business_center" },
  { label: "Office", value: "office" },
  { label: "School", value: "school" },
  { label: "International School", value: "international_school" },
  { label: "University", value: "university" },
  { label: "Daycare", value: "daycare" },
  { label: "Gym", value: "gym" },
];

export function getDiningTypes(c: Context) {
  return c.json({ options: DINING_ESTABLISHMENT_TYPES });
}

export function getAccommodationsTypes(c: Context) {
  return c.json({ options: ACCOMMODATIONS_TYPES });
}

export function getAttractionsTypes(c: Context) {
  return c.json({ options: ATTRACTIONS_TYPES });
}

export function getNightlifeTypes(c: Context) {
  return c.json({ options: NIGHTLIFE_TYPES });
}

export function getKeyLocationsTypes(c: Context) {
  return c.json({ options: KEY_LOCATIONS_TYPES });
}
