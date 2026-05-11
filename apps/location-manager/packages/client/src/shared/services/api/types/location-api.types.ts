import type { Category } from "./common.types";

export interface CreateMapsRequest {
  name: string;
  address: string;
  category: Category;
  title?: string;
  url?: string;
  lat?: number;
  lng?: number;
  locationKey?: string;
  district?: string;
  contactAddress?: string;
  type?: string;
  countryCode?: string;
  ianaTimeId?: string;
  phoneNumber?: string;
  website?: string;
  menuUrl?: string;
  reservationUrl?: string;
  email?: string;
  placeId?: string;
  tripadvisorUrl?: string;
  nightlifeDetails?: Record<string, unknown> | string;
  accommodationsDetails?: Record<string, unknown> | string;
  attractionsDetails?: Record<string, unknown> | string;
  keyLocationsDetails?: Record<string, unknown> | string;
  priceLevel?: string;
  idealFor?: string[];
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string;
  tripadvisorCuisines?: string[] | string;
  tripadvisorFeatures?: string[] | string;
  reviewsEnabled?: boolean;
  tourIds?: number[];
}

export interface GooglePrefillRequest {
  name: string;
  address: string;
}

export interface GooglePrefillResponse {
  googleUrl: string;
  placeId: string;
  lat: number;
  lng: number;
  locationKey: string | null;
  district: string | null;
  ianaTimeId: string | null;
  phoneNumber: string | null;
  website: string | null;
  priceLevel: string | null;
  operationHours: Record<string, unknown> | null;
  accommodationsHints: {
    source: "foursquare";
    foursquareId?: string;
    price?: string;
    perfectFor?: string[];
    ac?: "yes" | "no";
    wifi?: "yes" | "no";
    parking?: string[];
    pool?: string[];
  } | null;
}

export type AccommodationsFieldSuggestionFieldKey =
  | "type"
  | "price"
  | "perfectFor"
  | "kidFriendly"
  | "ac"
  | "wifi"
  | "extraGuestFee"
  | "parking"
  | "breakfastServed"
  | "vibe"
  | "workspace"
  | "restaurant"
  | "pool"
  | "rooftopLounge"
  | "jacuzzi"
  | "gym"
  | "walkability";

export interface AccommodationsFieldSuggestionRequest {
  fieldKey: AccommodationsFieldSuggestionFieldKey;
  formValues: Record<string, unknown>;
  apiContext?: Record<string, unknown>;
  allowedOptions?: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
}

export interface AccommodationsFieldSuggestionResponse {
  fieldKey: AccommodationsFieldSuggestionFieldKey;
  fieldLabel: string;
  kind: "single" | "multi";
  suggestion: string | string[] | null;
  confidence: number;
  reason: string;
  sources: Array<{
    label: string;
    url?: string;
    snippet?: string;
  }>;
  source: "existing-data" | "ai";
  error?: string;
}

export interface UpdateMapsRequest {
  name?: string;
  address?: string;
  title?: string;
  lat?: number | null;
  lng?: number | null;
  type?: string;
  locationKey?: string;
  district?: string | null;
  contactAddress?: string | null;
  countryCode?: string;
  ianaTimeId?: string | null;
  phoneNumber?: string;
  website?: string;
  menuUrl?: string | null;
  reservationUrl?: string | null;
  tripadvisorUrl?: string;
  selectedPayloadMediaSetIds?: string[] | null;
  idealFor?: string[];
  nightlifeDetails?: Record<string, unknown> | string | null;
  accommodationsDetails?: Record<string, unknown> | string | null;
  attractionsDetails?: Record<string, unknown> | string | null;
  keyLocationsDetails?: Record<string, unknown> | string | null;
  email?: string;
  neighborhoodDescription?: string;
  operationHours?: Record<string, unknown> | string;
  tripadvisorMealTypes?: string[] | string | null;
  tripadvisorCuisines?: string[] | string | null;
  tripadvisorFeatures?: string[] | string | null;
  priceLevel?: string | null;
  placeId?: string | null;
  reviewsEnabled?: boolean;
  autoApproveTaxonomy?: boolean;
  tourIds?: number[];
}

export interface TourRequest {
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  locationKey?: string | null;
}

export type UpdateTourRequest = Partial<TourRequest>;

export interface ToursResponse {
  tours: import("./location.types").Tour[];
}

export interface TourResponse {
  tour: import("./location.types").Tour;
}

export interface TourMediaSetResponse {
  mediaSetId: string;
}

export interface AddInstagramRequest {
  embedCode: string;
}

export interface OpenFolderRequest {
  folderPath: string;
}
