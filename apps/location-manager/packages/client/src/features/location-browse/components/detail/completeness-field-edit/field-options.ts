import type { NightlifeOption } from "@client/shared/constants/nightlife-options";
import {
  CLUB_TYPE_OPTIONS,
  CROWD_PROFILE_OPTIONS,
  DAYTIME_RESTAURANT_OPTIONS,
  DRESS_CODE_OPTIONS,
  ENERGY_LEVEL_OPTIONS,
  MUSIC_FORMAT_OPTIONS,
  MUSIC_OPTIONS,
  PEAK_HOURS_OPTIONS,
  PRICE_TIER_OPTIONS,
  SPACE_LAYOUT_OPTIONS,
  TOURIST_PRESENCE_OPTIONS,
  VENUE_SIZE_OPTIONS,
  VENUE_TYPE_OPTIONS,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIBE_OPTIONS,
} from "@client/shared/constants/nightlife-options";
import type { NightlifeFieldKey } from "@client/shared/lib/nightlife-details";

export const CATEGORIES = [
  { value: "dining", label: "Dining" },
  { value: "accommodations", label: "Accommodations" },
  { value: "attractions", label: "Attractions" },
  { value: "nightlife", label: "Nightlife" },
  { value: "key_locations", label: "Key Locations" },
] as const;

export const PRICE_LEVELS = [
  { value: "free", label: "free" },
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
  { value: "$$$$", label: "$$$$" },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: "America/Lima", label: "America/Lima (Peru)" },
  { value: "America/Bogota", label: "America/Bogota (Colombia)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brazil)" },
  { value: "America/Rio_Branco", label: "America/Rio_Branco (Brazil)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (Mexico)" },
  { value: "America/Tijuana", label: "America/Tijuana (Mexico)" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires (Argentina)" },
  { value: "America/Santiago", label: "America/Santiago (Chile)" },
] as const;

export const NIGHTLIFE_SINGLE_FIELD_OPTIONS: Partial<Record<NightlifeFieldKey, NightlifeOption[]>> = {
  "nightlife.clubType": CLUB_TYPE_OPTIONS,
  "nightlife.venueType": VENUE_TYPE_OPTIONS,
  "nightlife.venueSize": VENUE_SIZE_OPTIONS,
  "nightlife.peakHours": PEAK_HOURS_OPTIONS,
  "nightlife.priceTier": PRICE_TIER_OPTIONS,
  "nightlife.touristPresence": TOURIST_PRESENCE_OPTIONS,
  "nightlife.energyLevel": ENERGY_LEVEL_OPTIONS,
  "nightlife.vipAndBottleService": VIP_BOTTLE_SERVICE_OPTIONS,
  "nightlife.crowdProfile": CROWD_PROFILE_OPTIONS,
  "nightlife.daytimeRestaurant": DAYTIME_RESTAURANT_OPTIONS,
};

export const NIGHTLIFE_MULTI_FIELD_OPTIONS: Partial<Record<NightlifeFieldKey, NightlifeOption[]>> = {
  "nightlife.music": MUSIC_OPTIONS,
  "nightlife.spaceLayout": SPACE_LAYOUT_OPTIONS,
  "nightlife.vibe": VIBE_OPTIONS,
  "nightlife.musicFormat": MUSIC_FORMAT_OPTIONS,
  "nightlife.dressCode": DRESS_CODE_OPTIONS,
};
