// Maps Google Places `types[]` values to our DINING_ESTABLISHMENT_TYPES `value` slugs.
// Only includes mappings where Google's type cleanly identifies a single establishment format.
// Generic types (`food`, `point_of_interest`, `establishment`, plain `restaurant` when more
// specific types are also present) are intentionally not mapped — let the operator pick.
const GOOGLE_TYPE_TO_DINING_TYPE: Record<string, string> = {
  cafe: "cafe",
  coffee_shop: "coffee-shop",
  bakery: "bakery",
  ice_cream_shop: "ice-cream-shop",
  fast_food_restaurant: "fast-food-restaurant",
  sushi_restaurant: "sushi-bar",
  pizza_restaurant: "pizzeria",
  seafood_restaurant: "seafood-restaurant",
  steak_house: "steakhouse",
  barbecue_restaurant: "bbq-restaurant",
  ramen_restaurant: "ramen-shop",
  sandwich_shop: "sandwich-shop",
  hamburger_restaurant: "burger-joint",
  breakfast_restaurant: "breakfast-restaurant",
  brunch_restaurant: "brunch-spot",
  buffet_restaurant: "buffet-restaurant",
  fine_dining_restaurant: "fine-dining-restaurant",
  family_restaurant: "family-restaurant",
  mexican_restaurant: "mexican-restaurant",
  brazilian_restaurant: "brazilian-restaurant",
  bar_and_grill: "bar-and-grill",
  pub: "pub",
  wine_bar: "wine-bar",
};

// Ordered most-specific → least-specific. We prefer specific over generic when Google returns both.
const GENERIC_FALLBACK_ORDER: Array<{ googleType: string; ourType: string }> = [
  { googleType: "restaurant", ourType: "restaurant" },
];

export function mapGoogleTypesToDiningType(types: string[] | null | undefined): string | null {
  if (!types || types.length === 0) return null;

  for (const googleType of types) {
    const mapped = GOOGLE_TYPE_TO_DINING_TYPE[googleType];
    if (mapped) return mapped;
  }

  for (const fallback of GENERIC_FALLBACK_ORDER) {
    if (types.includes(fallback.googleType)) return fallback.ourType;
  }

  return null;
}

interface PlaceTypesResponse {
  status: string;
  result?: { types?: string[] };
}

export async function fetchPlaceTypes(placeId: string, apiKey: string): Promise<string[] | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=types&key=${apiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as PlaceTypesResponse;
    if (data.status !== "OK") return null;
    return data.result?.types ?? null;
  } catch {
    return null;
  }
}
