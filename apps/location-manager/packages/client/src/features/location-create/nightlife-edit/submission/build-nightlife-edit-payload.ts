import type { UpdateMapsRequest } from "@client/shared/services/api/types";
import { buildNightlifeDetails } from "@client/shared/lib/nightlife-details";
import {
  buildOperationHoursSummary,
  isOperationHoursJson,
} from "../../components/operation-hours-utils";
import type { EditNightlifeFormData } from "../nightlife-edit.types";
import { normalizeNightlifeAddress } from "../hydration/nightlife-edit-hydration";

export function buildNightlifeUpdatePayload(data: EditNightlifeFormData): UpdateMapsRequest {
  const normalizedAddress = normalizeNightlifeAddress(data.location);
  const operationHoursValue = (data.hours ?? "").trim();
  const hasStructuredHours = isOperationHoursJson(operationHoursValue);
  const nightlifeHours = hasStructuredHours
    ? buildOperationHoursSummary(operationHoursValue)
    : operationHoursValue;

  const nightlifeDetails = buildNightlifeDetails({
    name: data.name,
    priceTier: data.priceTier,
    clubType: data.clubType,
    music: data.music,
    venueType: data.venueType,
    venueSize: data.venueSize,
    spaceLayout: data.spaceLayout,
    vibe: data.vibe,
    peakHours: data.peakHours,
    touristPresence: data.touristPresence,
    musicFormat: data.musicFormat,
    dressCode: data.dressCode,
    energyLevel: data.energyLevel,
    vipAndBottleService: data.vipAndBottleService,
    crowdProfile: data.crowdProfile,
    location: normalizedAddress,
    phone: data.phone || "",
    hours: nightlifeHours,
    website: data.website || "",
    bookingUrl: data.bookingUrl || "",
    daytimeRestaurant: data.daytimeRestaurant,
  });

  return {
    name: data.name,
    title: data.name,
    address: normalizedAddress,
    type: data.clubType,
    priceLevel: data.priceTier,
    countryCode: data.countryCode,
    phoneNumber: data.phone || "",
    website: data.website || "",
    district: data.district || "",
    locationKey: data.locationKey || "",
    ianaTimeId: data.ianaTimeId || "",
    placeId: data.placeId || "",
    operationHours: hasStructuredHours ? operationHoursValue : undefined,
    nightlifeDetails,
  };
}
