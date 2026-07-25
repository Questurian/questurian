import type { LocationResponse } from "../../../../models/location";
import type { PayloadEntryData } from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { mapSharedPayloadFields } from "./shared-fields.mapper";
import {
  asBoolean,
  asRecord,
  asString,
  asStringArray,
  mapCategoryCommonPayloadFields,
} from "./value-normalizers";

const ALLOWED_PARKING = new Set(["onsite", "valet", "street", "garage"]);
const ALLOWED_JACUZZI = new Set(["private", "shared", "rooftop"]);
const ALLOWED_POOL = new Set(["indoor", "outdoor", "rooftop", "infinity"]);
const ALLOWED_WORKSPACE = new Set([
  "None",
  "Shared Lounge",
  "Dedicated Desk",
  "Co-working Space",
]);

function filterMultiSelect(
  values: string[] | undefined,
  allowed: Set<string>
): string[] | undefined {
  if (!values?.length) return undefined;
  const filtered = values.filter((value) => allowed.has(value));
  return filtered.length > 0 ? filtered : undefined;
}

function normalizeWorkspace(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return ALLOWED_WORKSPACE.has(trimmed) ? trimmed : undefined;
  }
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .find((item) => ALLOWED_WORKSPACE.has(item));
}

function mapAccommodationsGroups(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.accommodationsDetails) ?? {};
  const core = asRecord(details.core);
  const stay = asRecord(details.the_stay);
  const experience = asRecord(details.the_experience);
  const detailFields = asRecord(details.the_details);

  return {
    core: {
      name: asString(core?.name) ?? null,
      price: asString(core?.price) ?? null,
      district: asString(core?.district) ?? null,
      type: asString(core?.type) ?? null,
    },
    theStay: {
      perfectFor: asStringArray(stay?.perfect_for) ?? [],
      kidFriendly: asBoolean(stay?.kid_friendly) ?? false,
      ac: asBoolean(stay?.ac) ?? false,
      wifi: asBoolean(stay?.wifi) ?? false,
      extraGuestFee: asBoolean(stay?.extra_guest_fee) ?? false,
      parking: filterMultiSelect(asStringArray(stay?.parking), ALLOWED_PARKING) ?? [],
      breakfastServed: asBoolean(stay?.breakfast_served) ?? false,
    },
    theExperience: {
      vibe: asStringArray(experience?.vibe) ?? [],
      workspace: normalizeWorkspace(experience?.workspace) ?? null,
      restaurant: asBoolean(experience?.restaurant) ?? false,
      pool: filterMultiSelect(asStringArray(experience?.pool), ALLOWED_POOL) ?? [],
      rooftopLounge: asBoolean(experience?.rooftop_lounge) ?? false,
      jacuzzi: filterMultiSelect(asStringArray(experience?.jacuzzi), ALLOWED_JACUZZI) ?? [],
      gym: asString(experience?.gym) ?? null,
    },
    theDetails: {
      address: asString(detailFields?.address) ?? null,
      walkability: asString(detailFields?.walkability) ?? null,
      checkInTime: asString(detailFields?.check_in_time) ?? null,
      checkOutTime: asString(detailFields?.check_out_time) ?? null,
      phone: asString(detailFields?.phone) ?? null,
      websiteUrl: asString(detailFields?.website_url) ?? null,
      bookingUrl:
        asString(location.bookingUrl) ?? asString(detailFields?.booking_url) ?? null,
      googleMapsUrl: asString(detailFields?.google_maps_url) ?? null,
    },
  };
}

export function mapAccommodationsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...mapAccommodationsGroups(location),
  };
}
