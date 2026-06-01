import { addNightlifeSchema, type AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import { NIGHTLIFE_FORM_DEFAULT_VALUES } from "../nightlife-create.types";

const NIGHTLIFE_DRAFT_STORAGE_KEY = "lm:add-nightlife:draft:v1";

export interface NightlifeDraftPayload {
  formValues: AddNightlifeFormData;
  prefillSignature: string | null;
}

function isDraftEffectivelyEmpty(payload: NightlifeDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(NIGHTLIFE_FORM_DEFAULT_VALUES);
}

export function readNightlifeDraftFromStorage(): NightlifeDraftPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NightlifeDraftPayload>;
    const parsedValues = addNightlifeSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearNightlifeDraftFromStorage();
      return null;
    }

    return {
      formValues: {
        ...NIGHTLIFE_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddNightlifeFormData>),
      },
      prefillSignature: typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null,
    };
  } catch {
    clearNightlifeDraftFromStorage();
    return null;
  }
}

export function writeNightlifeDraftToStorage(payload: NightlifeDraftPayload) {
  if (typeof window === "undefined") return;
  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(NIGHTLIFE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (quota/private browsing/etc).
  }
}

export function clearNightlifeDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}
