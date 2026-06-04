import type { DiningFieldSuggestionResponse, TripadvisorPrefillFields } from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { LocationCategory } from "@shared/types/location-category";
import type { AddDiningFormData } from "../validation/add-dining.schema";

export type DiningPhase = "add" | "success";

export type AiSuggestionFieldKey = DiningFieldSuggestionResponse["fieldKey"];

export type AiFieldStatusState =
  | "idle"
  | "running"
  | "suggested"
  | "no-result"
  | "error";

export interface AiFieldStatus {
  state: AiFieldStatusState;
  confidence?: number;
  reason?: string;
  sources?: DiningFieldSuggestionResponse["sources"];
  errorMessage?: string;
  /** Minimum confidence that the server uses to gate suggestions. UI-only mirror. */
  confidenceThreshold: number;
}

export interface CreatedDiningLocation {
  id: number;
  category: LocationCategory;
  name: string;
  title: string;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string | null;
  menuUrl?: string | null;
  bookingUrl?: string | null;
  placeId?: string | null;
}

export const DINING_FORM_DEFAULT_VALUES: AddDiningFormData = {
  name: "",
  address: "",
  title: "",
  phoneNumber: "",
  website: "",
  type: "",
  idealFor: [],
  tripadvisorUrl: "",
  noTripadvisorListing: false,
  menuUrl: "",
  bookingUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
};

export type ProvenanceTrackedField = "type" | "tripadvisorUrl" | "menuUrl" | "bookingUrl";

export const PROVENANCE_TRACKED_FIELDS: readonly ProvenanceTrackedField[] = [
  "type",
  "tripadvisorUrl",
  "menuUrl",
  "bookingUrl",
];

export interface DiningDraftPayload {
  formValues: AddDiningFormData;
  prefillSignature: string | null;
  prefillOperationHours: Record<string, unknown> | null;
  prefillPhoneNumber: string | null;
  prefillWebsite: string | null;
  prefillTripadvisorPlaceData: TripadvisorPrefillFields | null;
  provenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>>;
  prefilledValues: Partial<Record<ProvenanceTrackedField, string>>;
}

export const AI_CONFIDENCE_THRESHOLD = 0.6;

export const AI_FIELD_KEYS: readonly AiSuggestionFieldKey[] = [
  "type",
  "idealFor",
  "menuUrl",
  "bookingUrl",
];
