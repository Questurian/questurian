import type { Context } from "hono";

interface TypeOption {
  label: string;
  value: string;
}

// Static type data - in production these would come from Payload CMS
const DINING_TYPES: TypeOption[] = [
  { label: "Restaurant", value: "restaurant" },
  { label: "Café", value: "cafe" },
  { label: "Bar", value: "bar" },
  { label: "Fast Food", value: "fast-food" },
  { label: "Fine Dining", value: "fine-dining" },
];

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
  { label: "Nightclub", value: "nightclub" },
  { label: "Lounge", value: "lounge" },
  { label: "Live Music", value: "live-music" },
  { label: "Cocktail Bar", value: "cocktail-bar" },
  { label: "Dance Club", value: "dance-club" },
];

export function getDiningTypes(c: Context) {
  return c.json({ options: DINING_TYPES });
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
