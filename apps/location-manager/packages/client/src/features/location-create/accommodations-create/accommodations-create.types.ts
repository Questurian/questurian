import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import type { AccommodationsSuggestionFieldKey } from "../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../validation/add-accommodations.schema";

export type AccommodationsFormSection =
  | "step1"
  | "entities"
  | "core"
  | "stay"
  | "experience"
  | "details"
  | "photos";

export type MultiField = "perfectFor" | "parking" | "vibe" | "workspace" | "pool" | "jacuzzi";
export type AiSuggestedField = AccommodationsSuggestionFieldKey;

export type ApiFilledField =
  | "googleUrl"
  | "googleMapsUrl"
  | "placeId"
  | "latitude"
  | "longitude"
  | "locationKey"
  | "district"
  | "ianaTimeId"
  | "phone"
  | "websiteUrl"
  | "price"
  | "perfectFor"
  | "ac"
  | "wifi"
  | "parking"
  | "pool";

export interface AccommodationsDraftPayload {
  formValues: AddAccommodationsFormData;
  prefillSignature: string | null;
}

export interface AutoFillProgress {
  total: number;
  completed: number;
  applied: number;
  failed: number;
  currentFieldLabel: string | null;
}

export type AiSuggestionEvidence = Partial<
  Record<AiSuggestedField, AccommodationsFieldSuggestionResponse>
>;

export const ACCOMMODATIONS_SECTION_ORDER: AccommodationsFormSection[] = [
  "step1",
  "entities",
  "core",
  "stay",
  "experience",
  "details",
  "photos",
];

export const ACCOMMODATIONS_FORM_DEFAULT_VALUES = {
  name: "",
  title: "",
  address: "",
  type: "",
  price: "",
  perfectFor: [],
  kidFriendly: "",
  ac: "",
  wifi: "",
  extraGuestFee: "",
  parking: [],
  breakfastServed: "",
  vibe: [],
  workspace: [],
  restaurant: "",
  pool: [],
  rooftopLounge: "",
  jacuzzi: [],
  gym: "",
  walkability: "",
  checkInTime: "",
  checkOutTime: "",
  phone: "",
  websiteUrl: "",
  bookingUrl: "",
  googleMapsUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
} as unknown as AddAccommodationsFormData;
