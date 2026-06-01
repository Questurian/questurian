import { buildNightlifeDetails } from "@client/shared/lib/nightlife-details";
import { buildOperationHoursSummary, isOperationHoursJson } from "../../components/operation-hours-utils";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import { normalizeNightlifeAddress } from "../nightlife-create.types";

export function buildNightlifeCreatePayload(data: AddNightlifeFormData) {
  const address = normalizeNightlifeAddress(data.location);
  const latValue = data.latitude?.trim() ? Number(data.latitude) : undefined;
  const lngValue = data.longitude?.trim() ? Number(data.longitude) : undefined;
  const operationHoursValue = (data.hours ?? "").trim();
  const hasStructuredHours = isOperationHoursJson(operationHoursValue);
  const hours = hasStructuredHours ? buildOperationHoursSummary(operationHoursValue) : operationHoursValue;
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
    location: address,
    phone: data.phone || "",
    hours,
    website: data.website || "",
    bookingUrl: data.bookingUrl || "",
    daytimeRestaurant: data.daytimeRestaurant,
  });

  return {
    name: data.name,
    title: data.name,
    address,
    category: "nightlife" as const,
    idealFor: data.idealFor,
    type: data.clubType,
    countryCode: data.countryCode,
    phoneNumber: data.phone || undefined,
    website: data.website || undefined,
    district: data.district || undefined,
    locationKey: data.locationKey || undefined,
    ianaTimeId: data.ianaTimeId || undefined,
    placeId: data.placeId || undefined,
    url: data.googleUrl || undefined,
    lat: Number.isFinite(latValue) ? latValue : undefined,
    lng: Number.isFinite(lngValue) ? lngValue : undefined,
    operationHours: hasStructuredHours ? operationHoursValue : undefined,
    tripadvisorUrl: data.tripadvisorUrl || undefined,
    bookingUrl: data.bookingUrl || undefined,
    nightlifeDetails,
  };
}
