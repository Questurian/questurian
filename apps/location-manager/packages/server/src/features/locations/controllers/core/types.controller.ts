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
  { label: "Park", value: "park" },
  { label: "Historical Site", value: "historical-site" },
  { label: "Shopping", value: "shopping" },
  { label: "Entertainment", value: "entertainment" },
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
  { label: "Bus Stop", value: "bus_stop" },
  { label: "Currency Exchange", value: "currency_exchange" },
  { label: "Bus Terminal", value: "bus_terminal" },
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
