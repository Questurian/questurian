import type { LocationResponse } from "@client/shared/services/api/types";
import { parseNightlifeDetails } from "@client/shared/lib/nightlife-details";
import {
  buildNightlifePrefillSignature,
  normalizeNightlifeAddress,
} from "../../nightlife-create/nightlife-create.types";
import {
  CLUB_TYPE_VALUES,
  CROWD_PROFILE_VALUES,
  DAYTIME_RESTAURANT_VALUES,
  DRESS_CODE_VALUES,
  ENERGY_LEVEL_VALUES,
  MUSIC_FORMAT_VALUES,
  MUSIC_VALUES,
  PEAK_HOURS_VALUES,
  PRICE_TIER_VALUES,
  SPACE_LAYOUT_VALUES,
  TOURIST_PRESENCE_VALUES,
  VENUE_SIZE_VALUES,
  VENUE_TYPE_VALUES,
  VIP_BOTTLE_SERVICE_VALUES,
  VIBE_VALUES,
} from "../../constants/nightlife-options";
import {
  NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES,
  type EditNightlifeFormData,
} from "../nightlife-edit.types";

export { buildNightlifePrefillSignature, normalizeNightlifeAddress };

export function pickSingleOption<T extends readonly string[]>(
  value: string | null | undefined,
  options: T,
  fallback: T[number]
): T[number] {
  if (value && options.includes(value as T[number])) return value as T[number];
  return fallback;
}

export function pickMultiOptions<T extends readonly string[]>(
  values: string[] | null | undefined,
  options: T,
  fallback: readonly T[number][]
): T[number][] {
  if (!values || values.length === 0) return [...fallback] as T[number][];
  const optionSet = new Set<string>(options);
  const validValues = values.filter((value): value is T[number] => optionSet.has(value));
  return validValues.length > 0 ? validValues : ([...fallback] as T[number][]);
}

export function normalizeCountryCode(value: string | null | undefined): string {
  if (!value) return NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.countryCode;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 2 ? normalized : NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.countryCode;
}

export function buildNightlifeEditFormValues(location: LocationResponse): EditNightlifeFormData {
  const details = parseNightlifeDetails(location.nightlifeDetails);

  return {
    ...NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES,
    name: location.source.name || details.name || NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.name,
    priceTier: pickSingleOption(
      details.priceTier ?? location.priceLevel,
      PRICE_TIER_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.priceTier
    ),
    clubType: pickSingleOption(
      details.clubType ?? location.type,
      CLUB_TYPE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.clubType
    ),
    music: pickMultiOptions(details.music, MUSIC_VALUES, NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.music),
    venueType: pickSingleOption(
      details.venueType,
      VENUE_TYPE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.venueType
    ),
    venueSize: pickSingleOption(
      details.venueSize,
      VENUE_SIZE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.venueSize
    ),
    spaceLayout: pickMultiOptions(
      details.spaceLayout,
      SPACE_LAYOUT_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.spaceLayout
    ),
    vibe: pickMultiOptions(details.vibe, VIBE_VALUES, NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.vibe),
    peakHours: pickSingleOption(
      details.peakHours,
      PEAK_HOURS_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.peakHours
    ),
    touristPresence: pickSingleOption(
      details.touristPresence,
      TOURIST_PRESENCE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.touristPresence
    ),
    musicFormat: pickMultiOptions(
      details.musicFormat,
      MUSIC_FORMAT_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.musicFormat
    ),
    dressCode: pickMultiOptions(
      details.dressCode,
      DRESS_CODE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.dressCode
    ),
    energyLevel: pickSingleOption(
      details.energyLevel,
      ENERGY_LEVEL_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.energyLevel
    ),
    vipAndBottleService: pickSingleOption(
      details.vipAndBottleService,
      VIP_BOTTLE_SERVICE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.vipAndBottleService
    ),
    crowdProfile: pickSingleOption(
      details.crowdProfile,
      CROWD_PROFILE_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.crowdProfile
    ),
    countryCode: normalizeCountryCode(location.contact.countryCode),
    location: location.source.address || details.location || NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.location,
    phone: location.contact.phoneNumber || details.phone || "",
    hours: location.operationHours ? JSON.stringify(location.operationHours, null, 2) : details.hours || "",
    website: location.contact.website || details.website || "",
    bookingUrl: details.bookingUrl || "",
    district: location.district || "",
    locationKey: location.locationKey || "",
    ianaTimeId: location.ianaTimeId || "",
    placeId: location.placeId || "",
    googleUrl: location.contact.url || "",
    latitude: location.coordinates.lat != null ? String(location.coordinates.lat) : "",
    longitude: location.coordinates.lng != null ? String(location.coordinates.lng) : "",
    daytimeRestaurant: pickSingleOption(
      details.daytimeRestaurant,
      DAYTIME_RESTAURANT_VALUES,
      NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES.daytimeRestaurant
    ),
  };
}
