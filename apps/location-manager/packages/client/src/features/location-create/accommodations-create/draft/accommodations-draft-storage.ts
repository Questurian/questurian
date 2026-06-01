import { addAccommodationsSchema } from "../../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_FORM_DEFAULT_VALUES,
  type AccommodationsDraftPayload,
} from "../accommodations-create.types";

const ACCOMMODATIONS_DRAFT_STORAGE_KEY = "lm:add-accommodations:draft:v1";

function isDraftEffectivelyEmpty(payload: AccommodationsDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
}

export function clearAccommodationsDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

export function readAccommodationsDraftFromStorage(): AccommodationsDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AccommodationsDraftPayload>;
    const parsedValues = addAccommodationsSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearAccommodationsDraftFromStorage();
      return null;
    }

    return {
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        ...parsedValues.data,
      } as AccommodationsDraftPayload["formValues"],
      prefillSignature: typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null,
    };
  } catch {
    clearAccommodationsDraftFromStorage();
    return null;
  }
}

export function writeAccommodationsDraftToStorage(payload: AccommodationsDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ACCOMMODATIONS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}
