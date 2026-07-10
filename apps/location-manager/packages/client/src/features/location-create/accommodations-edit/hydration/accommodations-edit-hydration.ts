import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { ACCOMMODATIONS_FORM_DEFAULT_VALUES } from "../../accommodations-create/accommodations-create.types";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";

export function booleanToOptionalYesNo(value: boolean | null | undefined): "" | "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

export function toBoolean(value: "yes" | "no"): boolean {
  return value === "yes";
}

export function pickSingleOption<T extends readonly string[]>(
  value: string | null | undefined,
  options: T
): T[number] | "" {
  if (value && options.includes(value as T[number])) {
    return value as T[number];
  }
  return "";
}

export function pickMultiOptions<T extends readonly string[]>(
  values: string[] | null | undefined,
  options: T
): T[number][] {
  if (!values || values.length === 0) return [];
  const optionSet = new Set<string>(options);
  const validValues = values.filter((value): value is T[number] => optionSet.has(value));
  if (validValues.length === 0) return [];
  return validValues;
}

/**
 * True when the saved location has no title but a source/core name is available,
 * so the form can backfill the title even when nothing else is dirty.
 */
export function needsTitleBackfill(location: LocationResponse): boolean {
  if (location.title?.trim()) return false;
  const details = parseAccommodationsDetails(location.accommodationsDetails);
  return Boolean(location.source.name?.trim() || details.coreName?.trim());
}

/** Maps a saved accommodations location into react-hook-form default values. */
export function buildAccommodationsEditFormValues(
  location: LocationResponse
): AddAccommodationsFormData {
  const details = parseAccommodationsDetails(location.accommodationsDetails);

  return {
    name: location.source.name || details.coreName || ACCOMMODATIONS_FORM_DEFAULT_VALUES.name,
    title:
      location.title?.trim() ||
      location.source.name ||
      details.coreName ||
      ACCOMMODATIONS_FORM_DEFAULT_VALUES.title,
    address: location.source.address || details.address || ACCOMMODATIONS_FORM_DEFAULT_VALUES.address,
    type: location.type || details.coreType || "",
    price: pickSingleOption(details.corePrice || location.priceLevel || null, ["$", "$$", "$$$", "$$$$"] as const),
    perfectFor: pickMultiOptions(details.perfectFor, ["Solo", "Couples", "Groups"] as const),
    kidFriendly: booleanToOptionalYesNo(details.kidFriendly),
    ac: booleanToOptionalYesNo(details.ac),
    wifi: booleanToOptionalYesNo(details.wifi),
    extraGuestFee: booleanToOptionalYesNo(details.extraGuestFee),
    parking: pickMultiOptions(details.parking, ["none", "onsite", "valet", "street", "garage"] as const),
    breakfastServed: booleanToOptionalYesNo(details.breakfastServed),
    vibe: pickMultiOptions(
      details.vibe,
      ["Luxury", "Social", "Quiet", "Boutique", "Family-Friendly", "Business-Friendly"] as const
    ),
    workspace: pickMultiOptions(
      details.workspace,
      ["None", "Shared Lounge", "Dedicated Desk", "Co-working Space"] as const
    ),
    restaurant: booleanToOptionalYesNo(details.restaurant),
    pool: pickMultiOptions(details.pool, ["none", "indoor", "outdoor", "rooftop", "infinity"] as const),
    rooftopLounge: booleanToOptionalYesNo(details.rooftopLounge),
    jacuzzi: pickMultiOptions(details.jacuzzi, ["none", "private", "shared", "rooftop"] as const),
    gym: pickSingleOption(details.gym, ["None", "Basic", "Full", "24/7"] as const),
    walkability: pickSingleOption(
      details.walkability,
      ["Walkable Downtown", "Transit-Friendly", "Car Needed", "Secluded"] as const
    ),
    checkInTime: details.checkInTime || ACCOMMODATIONS_FORM_DEFAULT_VALUES.checkInTime,
    checkOutTime: details.checkOutTime || ACCOMMODATIONS_FORM_DEFAULT_VALUES.checkOutTime,
    phone: location.contact.phoneNumber || details.phone || "",
    phoneNotAvailable: !(location.contact.phoneNumber || details.phone || "").trim(),
    websiteUrl: location.contact.website || details.websiteUrl || "",
    bookingUrl: details.bookingUrl || "",
    googleMapsUrl: details.googleMapsUrl || location.contact.url || "",
    googleUrl: location.contact.url || details.googleMapsUrl || "",
    placeId: location.placeId || "",
    latitude: location.coordinates.lat != null ? String(location.coordinates.lat) : "",
    longitude: location.coordinates.lng != null ? String(location.coordinates.lng) : "",
    locationKey: location.locationKey || "",
    district: location.district || details.coreDistrict || "",
    ianaTimeId: location.ianaTimeId || "",
  } as unknown as AddAccommodationsFormData;
}
