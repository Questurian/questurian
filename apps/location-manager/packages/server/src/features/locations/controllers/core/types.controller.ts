import type { Context } from "hono";

interface TypeOption {
  label: string;
  value: string;
}

// Static type data - in production these would come from Payload CMS
const DINING_TYPES: TypeOption[] = [
  { label: "Restaurant", value: "restaurant" },
  { label: "Café", value: "cafe" },
  { label: "Coffee Shop", value: "coffee-shop" },
  { label: "Bakery", value: "bakery" },
  { label: "Bistro", value: "bistro" },
  { label: "Brasserie", value: "brasserie" },
  { label: "Diner", value: "diner" },
  { label: "Family Restaurant", value: "family-restaurant" },
  { label: "Casual Dining Restaurant", value: "casual-dining-restaurant" },
  { label: "Fine Dining Restaurant", value: "fine-dining-restaurant" },
  { label: "Buffet Restaurant", value: "buffet-restaurant" },
  { label: "Food Hall", value: "food-hall" },
  { label: "Food Court Stall", value: "food-court-stall" },
  { label: "Food Truck", value: "food-truck" },
  { label: "Bar", value: "bar" },
  { label: "Bar & Grill", value: "bar-and-grill" },
  { label: "Gastropub", value: "gastropub" },
  { label: "Fast Food Restaurant", value: "fast-food-restaurant" },
  { label: "Steakhouse", value: "steakhouse" },
  { label: "Seafood Restaurant", value: "seafood-restaurant" },
  { label: "Grill House", value: "grill-house" },
  { label: "BBQ Restaurant", value: "bbq-restaurant" },
  { label: "Pizzeria", value: "pizzeria" },
  { label: "Sushi Bar", value: "sushi-bar" },
  { label: "Ramen Shop", value: "ramen-shop" },
  { label: "Noodle House", value: "noodle-house" },
  { label: "Burger Joint", value: "burger-joint" },
  { label: "Sandwich Shop", value: "sandwich-shop" },
  { label: "Dessert Shop", value: "dessert-shop" },
  { label: "Ice Cream Shop", value: "ice-cream-shop" },
  { label: "Juice Bar", value: "juice-bar" },
  { label: "Tea House", value: "tea-house" },
  { label: "Brunch Spot", value: "brunch-spot" },
  { label: "Breakfast Restaurant", value: "breakfast-restaurant" },
  { label: "Peruvian Restaurant", value: "peruvian-restaurant" },
  { label: "Colombian Restaurant", value: "colombian-restaurant" },
  { label: "Brazilian Restaurant", value: "brazilian-restaurant" },
  { label: "Mexican Restaurant", value: "mexican-restaurant" },
  { label: "Nikkei Restaurant", value: "nikkei-restaurant" },
  { label: "Chifa Restaurant", value: "chifa-restaurant" },
  { label: "Pollería", value: "polleria" },
  { label: "Cevichería", value: "cevicheria" },
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
