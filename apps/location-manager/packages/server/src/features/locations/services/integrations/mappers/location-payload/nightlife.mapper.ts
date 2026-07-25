import type { LocationResponse } from "../../../../models/location";
import type {
  PayloadEntryData,
  PayloadNightlifeDetails,
} from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { mapSharedPayloadFields } from "./shared-fields.mapper";
import {
  asBoolean,
  asRecord,
  asString,
  asStringArray,
  mapCategoryCommonPayloadFields,
  unwrapLabeledValue,
} from "./value-normalizers";

function getSectionValue(
  details: Record<string, unknown>,
  section: "theSpace" | "theScene" | "theDetails",
  key: string
): unknown {
  const currentSection = asRecord(details[section]);
  const legacySection = asRecord(asRecord(details.details)?.[section]);
  return unwrapLabeledValue(currentSection?.[key] ?? legacySection?.[key]);
}

function getNightlifeDetailsPayload(location: LocationResponse): PayloadNightlifeDetails {
  const details = asRecord(location.nightlifeDetails) ?? {};
  const core = asRecord(details.core);
  const detailFields = asRecord(details.theDetails);
  const operationHours =
    asRecord(detailFields?.operationHours) ??
    asRecord(getSectionValue(details, "theDetails", "operationHours")) ??
    location.operationHours ??
    null;
  const bookingUrl =
    location.bookingUrl ??
    asString(detailFields?.bookingUrl) ??
    asString(details.booking_url) ??
    asString(getSectionValue(details, "theDetails", "bookingUrl")) ??
    asString(details.reserve_url) ??
    null;

  return {
    core: {
      name:
        asString(core?.name) ??
        asString(details.name) ??
        location.title ??
        location.source.name ??
        "",
      clubType:
        asString(core?.clubType) ??
        asString(details.club_type) ??
        asString(location.type) ??
        null,
      priceTier:
        asString(core?.priceTier) ??
        asString(details.price_tier) ??
        asString(location.priceLevel) ??
        null,
      music: asStringArray(core?.music ?? details.music) ?? [],
      idealFor: asStringArray(core?.idealFor ?? location.idealFor) ?? [],
    },
    theSpace: {
      venueType: asString(getSectionValue(details, "theSpace", "venueType")) ?? null,
      venueSize: asString(getSectionValue(details, "theSpace", "venueSize")) ?? null,
      spaceLayout: asStringArray(getSectionValue(details, "theSpace", "spaceLayout")) ?? [],
      vibe: asStringArray(getSectionValue(details, "theSpace", "vibe")) ?? [],
      peakHours: asString(getSectionValue(details, "theSpace", "peakHours")) ?? null,
    },
    theScene: {
      musicFormat: asStringArray(getSectionValue(details, "theScene", "musicFormat")) ?? [],
      touristPresence:
        asString(getSectionValue(details, "theScene", "touristPresence")) ?? null,
      dressCode: asStringArray(getSectionValue(details, "theScene", "dressCode")) ?? [],
      energyLevel: asString(getSectionValue(details, "theScene", "energyLevel")) ?? null,
      vipAndBottleService:
        asString(getSectionValue(details, "theScene", "vipAndBottleService")) ?? null,
      crowdProfile: asString(getSectionValue(details, "theScene", "crowdProfile")) ?? null,
    },
    theDetails: {
      operationHours,
      bookingUrl,
      daytimeRestaurant:
        asBoolean(detailFields?.daytimeRestaurant) ??
        asBoolean(details.daytime_restaurant) ??
        asBoolean(getSectionValue(details, "theDetails", "daytimeRestaurant")) ??
        false,
    },
  };
}

export function mapNightlifePayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const sharedFields = mapSharedPayloadFields(location, uploadedImages, locationRef);
  const { countryCodeIso, sourceName, ...nightlifeSharedFields } = sharedFields;
  return {
    ...nightlifeSharedFields,
    ...mapCategoryCommonPayloadFields(location),
    location: location.locationKey ?? "",
    nightlifeDetails: getNightlifeDetailsPayload(location),
  };
}
