import type { TripadvisorPrefillFields } from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import { addDiningSchema } from "../../validation/add-dining.schema";
import {
  DINING_FORM_DEFAULT_VALUES,
  PROVENANCE_TRACKED_FIELDS,
  type DiningDraftPayload,
  type ProvenanceTrackedField,
} from "../dining-create.types";

const DINING_DRAFT_STORAGE_KEY = "lm:add-dining:draft:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDraftEffectivelyEmpty(payload: DiningDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  if (payload.prefillOperationHours !== null) return false;
  if (payload.prefillPhoneNumber !== null) return false;
  if (payload.prefillWebsite !== null) return false;
  if (payload.prefillTripadvisorPlaceData !== null) return false;
  if (Object.keys(payload.provenance).length > 0) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(DINING_FORM_DEFAULT_VALUES);
}

export function isFieldProvenanceValue(value: unknown): value is FieldProvenance {
  return (
    value === "google" ||
    value === "tripadvisor" ||
    value === "scraper" ||
    value === "ai" ||
    value === "operator"
  );
}

function sanitizeProvenanceMap(
  raw: unknown
): Partial<Record<ProvenanceTrackedField, FieldProvenance>> {
  if (!isRecord(raw)) return {};
  const result: Partial<Record<ProvenanceTrackedField, FieldProvenance>> = {};
  for (const field of PROVENANCE_TRACKED_FIELDS) {
    const value = raw[field];
    if (isFieldProvenanceValue(value)) result[field] = value;
  }
  return result;
}

function sanitizePrefilledValues(
  raw: unknown
): Partial<Record<ProvenanceTrackedField, string>> {
  if (!isRecord(raw)) return {};
  const result: Partial<Record<ProvenanceTrackedField, string>> = {};
  for (const field of PROVENANCE_TRACKED_FIELDS) {
    const value = raw[field];
    if (typeof value === "string") result[field] = value;
  }
  return result;
}

export function clearDiningDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DINING_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

export function readDiningDraftFromStorage(): DiningDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(DINING_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DiningDraftPayload>;
    const parsedValues = addDiningSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearDiningDraftFromStorage();
      return null;
    }

    return {
      formValues: {
        ...DINING_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<DiningDraftPayload["formValues"]>),
      },
      prefillSignature: typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null,
      prefillOperationHours: isRecord(parsed.prefillOperationHours) ? parsed.prefillOperationHours : null,
      prefillPhoneNumber: typeof parsed.prefillPhoneNumber === "string" ? parsed.prefillPhoneNumber : null,
      prefillWebsite: typeof parsed.prefillWebsite === "string" ? parsed.prefillWebsite : null,
      prefillTripadvisorPlaceData: isRecord(parsed.prefillTripadvisorPlaceData)
        ? (parsed.prefillTripadvisorPlaceData as TripadvisorPrefillFields)
        : null,
      provenance: sanitizeProvenanceMap(parsed.provenance),
      prefilledValues: sanitizePrefilledValues(parsed.prefilledValues),
    };
  } catch {
    clearDiningDraftFromStorage();
    return null;
  }
}

export function writeDiningDraftToStorage(payload: DiningDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(DINING_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DINING_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (quota/private browsing/etc).
  }
}
