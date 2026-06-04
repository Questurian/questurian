import type { TripadvisorPrefillFields } from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import {
  normalizeDiningAddress,
  type AddDiningFormData,
} from "../../validation/add-dining.schema";
import type { ProvenanceTrackedField } from "../dining-create.types";

interface BuildDiningCreatePayloadContext {
  prefillOperationHours: Record<string, unknown> | null;
  prefillPhoneNumber: string | null;
  prefillWebsite: string | null;
  prefillTripadvisorPlaceData: TripadvisorPrefillFields | null;
  provenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>>;
}

export function buildDiningCreatePayload(
  data: AddDiningFormData,
  {
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
    prefillTripadvisorPlaceData,
    provenance,
  }: BuildDiningCreatePayloadContext
) {
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  const ta = prefillTripadvisorPlaceData;

  return {
    name: data.name,
    address: normalizeDiningAddress(data.address),
    category: "dining" as const,
    title: data.title || data.name,
    type: data.type || undefined,
    idealFor: data.idealFor,
    tripadvisorUrl: data.tripadvisorUrl || undefined,
    menuUrl: data.menuUrl || undefined,
    bookingUrl: data.bookingUrl || undefined,
    url: data.googleUrl || undefined,
    placeId: data.placeId || undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    locationKey: data.locationKey || undefined,
    district: data.district || ta?.neighborhood || undefined,
    ianaTimeId: data.ianaTimeId || undefined,
    operationHours: prefillOperationHours || ta?.operationHours || undefined,
    phoneNumber: data.phoneNumber || prefillPhoneNumber || ta?.phoneNumber || undefined,
    website: data.website || prefillWebsite || ta?.website || undefined,
    email: ta?.email || undefined,
    neighborhoodDescription: ta?.neighborhoodDescription || undefined,
    priceLevel: ta?.priceLevel || undefined,
    tripadvisorMealTypes: ta?.mealTypes ?? undefined,
    tripadvisorCuisines: ta?.cuisines ?? undefined,
    tripadvisorFeatures: ta?.features ?? undefined,
    provenance:
      Object.keys(provenance).length > 0
        ? (provenance as Record<string, string>)
        : undefined,
  };
}
