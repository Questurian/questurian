import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  useCreateLocation,
  useLocationTypes,
} from "@client/shared/services/api/hooks";
import { locationsApi } from "@client/shared/services/api";
import type {
  DiningFieldSuggestionResponse,
  TripadvisorPrefillFields,
} from "@client/shared/services/api/types";
import { addFlowPhotoSession } from "../lib/add-flow-photo-session";
import type { CroppedPhotoSource } from "../components/PhotoImportPhase";
import type { LocationCategory } from "@shared/types/location-category";
import type { FieldProvenance } from "@questurian/lm-shared";
import {
  addDiningSchema,
  addDiningSubmitSchema,
  buildDiningPrefillSignature,
  normalizeDiningAddress,
  validateTripadvisorEntry,
  type AddDiningFormData,
} from "../validation/add-dining.schema";

export type DiningPhase = "add" | "success";

export type AiSuggestionFieldKey =
  DiningFieldSuggestionResponse["fieldKey"];

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

const AI_CONFIDENCE_THRESHOLD = 0.6;

const AI_FIELD_KEYS: readonly AiSuggestionFieldKey[] = [
  "type",
  "idealFor",
  "menuUrl",
  "reservationUrl",
];

function initialAiFieldStatusMap(): Record<AiSuggestionFieldKey, AiFieldStatus> {
  return AI_FIELD_KEYS.reduce(
    (acc, key) => {
      acc[key] = { state: "idle", confidenceThreshold: AI_CONFIDENCE_THRESHOLD };
      return acc;
    },
    {} as Record<AiSuggestionFieldKey, AiFieldStatus>
  );
}

interface CreatedLocation {
  id: number;
  category: LocationCategory;
  name: string;
  title: string;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string | null;
  menuUrl?: string | null;
  reservationUrl?: string | null;
  placeId?: string | null;
}

const DINING_DRAFT_STORAGE_KEY = "lm:add-dining:draft:v1";

const DINING_FORM_DEFAULT_VALUES: AddDiningFormData = {
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
  reservationUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
};

type ProvenanceTrackedField = "type" | "tripadvisorUrl" | "menuUrl" | "reservationUrl";

const PROVENANCE_TRACKED_FIELDS: readonly ProvenanceTrackedField[] = [
  "type",
  "tripadvisorUrl",
  "menuUrl",
  "reservationUrl",
];

interface DiningDraftPayload {
  formValues: AddDiningFormData;
  prefillSignature: string | null;
  prefillOperationHours: Record<string, unknown> | null;
  prefillPhoneNumber: string | null;
  prefillWebsite: string | null;
  prefillTripadvisorPlaceData: TripadvisorPrefillFields | null;
  provenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>>;
  prefilledValues: Partial<Record<ProvenanceTrackedField, string>>;
}

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

function isFieldProvenanceValue(value: unknown): value is FieldProvenance {
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
    if (isFieldProvenanceValue(value)) {
      result[field] = value;
    }
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
    if (typeof value === "string") {
      result[field] = value;
    }
  }
  return result;
}

function clearDiningDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DINING_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function readDiningDraftFromStorage(): DiningDraftPayload | null {
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

    const prefillSignature =
      typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null;
    const prefillOperationHours = isRecord(parsed.prefillOperationHours)
      ? parsed.prefillOperationHours
      : null;
    const prefillPhoneNumber =
      typeof parsed.prefillPhoneNumber === "string" ? parsed.prefillPhoneNumber : null;
    const prefillWebsite =
      typeof parsed.prefillWebsite === "string" ? parsed.prefillWebsite : null;
    const prefillTripadvisorPlaceData = isRecord(parsed.prefillTripadvisorPlaceData)
      ? (parsed.prefillTripadvisorPlaceData as TripadvisorPrefillFields)
      : null;

    return {
      formValues: {
        ...DINING_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddDiningFormData>),
      },
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
      prefillTripadvisorPlaceData,
      provenance: sanitizeProvenanceMap(parsed.provenance),
      prefilledValues: sanitizePrefilledValues(parsed.prefilledValues),
    };
  } catch {
    clearDiningDraftFromStorage();
    return null;
  }
}

function writeDiningDraftToStorage(payload: DiningDraftPayload) {
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

function statusFromAiResult(
  result: DiningFieldSuggestionResponse
): AiFieldStatus {
  if (result.error) {
    return {
      state: "error",
      errorMessage: result.error,
      confidence: result.confidence,
      reason: result.reason,
      sources: result.sources,
      confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    };
  }
  if (result.suggestion == null) {
    return {
      state: "no-result",
      confidence: result.confidence,
      reason: result.reason,
      sources: result.sources,
      confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    };
  }
  return {
    state: "suggested",
    confidence: result.confidence,
    reason: result.reason,
    sources: result.sources,
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
}

function statusFromThrown(err: unknown): AiFieldStatus {
  return {
    state: "error",
    errorMessage: err instanceof Error ? err.message : String(err),
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
}

export function useAddDiningFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<DiningPhase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [prefillOperationHours, setPrefillOperationHours] = useState<Record<string, unknown> | null>(null);
  const [prefillPhoneNumber, setPrefillPhoneNumber] = useState<string | null>(null);
  const [prefillWebsite, setPrefillWebsite] = useState<string | null>(null);
  const [prefillTripadvisorPlaceData, setPrefillTripadvisorPlaceData] =
    useState<TripadvisorPrefillFields | null>(null);
  const [aiBatchStep, setAiBatchStep] = useState<
    "google" | "tripadvisor" | "ai" | null
  >(null);
  const [verifiedAiUrls, setVerifiedAiUrls] = useState<
    Record<"menuUrl" | "reservationUrl", boolean>
  >({ menuUrl: true, reservationUrl: true });
  const [provenance, setProvenance] = useState<Partial<Record<ProvenanceTrackedField, FieldProvenance>>>({});
  const [prefilledValues, setPrefilledValues] = useState<Partial<Record<ProvenanceTrackedField, string>>>({});
  const [aiFieldStatus, setAiFieldStatus] = useState<
    Record<AiSuggestionFieldKey, AiFieldStatus>
  >(() => initialAiFieldStatusMap());
  const hasHydratedDraftRef = useRef(false);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const [photoSubmitError, setPhotoSubmitError] = useState<Error | null>(null);
  const [isCreatingWithPhotos, setIsCreatingWithPhotos] = useState(false);
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("dining");

  const addForm = useForm<AddDiningFormData>({
    resolver: zodResolver(addDiningSchema),
    defaultValues: DINING_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  useEffect(() => {
    const draft = readDiningDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    addForm.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillOperationHours(draft.prefillOperationHours);
    setPrefillPhoneNumber(draft.prefillPhoneNumber);
    setPrefillWebsite(draft.prefillWebsite);
    setPrefillTripadvisorPlaceData(draft.prefillTripadvisorPlaceData);
    setProvenance(draft.provenance);
    setPrefilledValues(draft.prefilledValues);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [addForm]);

  useEffect(() => {
    const subscription = addForm.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeDiningDraftToStorage({
        formValues: {
          ...DINING_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddDiningFormData>),
        },
        prefillSignature,
        prefillOperationHours,
        prefillPhoneNumber,
        prefillWebsite,
        prefillTripadvisorPlaceData,
        provenance,
        prefilledValues,
      });
    });

    return () => subscription.unsubscribe();
  }, [
    addForm,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
    prefillTripadvisorPlaceData,
    provenance,
    prefilledValues,
  ]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeDiningDraftToStorage({
      formValues: addForm.getValues(),
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
      prefillTripadvisorPlaceData,
      provenance,
      prefilledValues,
    });
  }, [
    addForm,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
    prefillTripadvisorPlaceData,
    provenance,
    prefilledValues,
  ]);

  const currentPrefillSignature = buildDiningPrefillSignature(
    addForm.watch("name"),
    addForm.watch("address")
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;

  // Clear provenance for any tracked field whose value diverges from the prefilled value.
  // Operator edit ⇒ field is operator-owned ⇒ no badge ⇒ AI URL verification no longer required.
  useEffect(() => {
    const subscription = addForm.watch((value, { name }) => {
      if (!name) return;
      const trackedField = PROVENANCE_TRACKED_FIELDS.find((field) => field === name);
      if (!trackedField) return;
      const current = (value as Partial<AddDiningFormData>)[trackedField];
      const prefilled = prefilledValues[trackedField];
      if (prefilled === undefined) return;
      if (typeof current !== "string" || current !== prefilled) {
        setProvenance((prev) => {
          if (!(trackedField in prev)) return prev;
          const next = { ...prev };
          delete next[trackedField];
          return next;
        });
        if (trackedField === "menuUrl" || trackedField === "reservationUrl") {
          setVerifiedAiUrls((prev) =>
            prev[trackedField] ? prev : { ...prev, [trackedField]: true }
          );
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [addForm, prefilledValues]);

  interface AiCallContext {
    name: string;
    address: string;
    prefillType: string;
    currentIdealFor: string[];
  }

  function buildAiApiContextFromState(): Record<string, unknown> {
    const ta = prefillTripadvisorPlaceData;
    return {
      placeId: addForm.getValues("placeId") || null,
      locationKey: addForm.getValues("locationKey") || null,
      district: addForm.getValues("district") || null,
      priceLevel: ta?.priceLevel ?? null,
      website: addForm.getValues("website") || prefillWebsite || null,
      tripadvisorUrl: addForm.getValues("tripadvisorUrl") || null,
      tripadvisorMealTypes: ta?.mealTypes ?? null,
      tripadvisorCuisines: ta?.cuisines ?? null,
      tripadvisorFeatures: ta?.features ?? null,
    };
  }

  async function callAiSuggestion(
    fieldKey: AiSuggestionFieldKey,
    ctx: AiCallContext
  ): Promise<DiningFieldSuggestionResponse> {
    return locationsApi.suggestDiningField({
      category: "dining",
      fieldKey,
      formValues: {
        name: ctx.name,
        address: ctx.address,
        type: ctx.prefillType,
        idealFor: ctx.currentIdealFor,
      },
      apiContext: buildAiApiContextFromState(),
    });
  }

  function applyAiResultToForm(
    result: DiningFieldSuggestionResponse,
    opts: {
      wantsTypeFromAi: boolean;
      nextProvenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>>;
      nextPrefilled: Partial<Record<ProvenanceTrackedField, string>>;
      onUrlSuggested?: (field: "menuUrl" | "reservationUrl") => void;
    }
  ) {
    const { wantsTypeFromAi, nextProvenance, nextPrefilled, onUrlSuggested } = opts;
    if (result.fieldKey === "idealFor" && Array.isArray(result.suggestion)) {
      addForm.setValue("idealFor", result.suggestion as AddDiningFormData["idealFor"], {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
    }
    if (
      result.fieldKey === "type" &&
      typeof result.suggestion === "string" &&
      wantsTypeFromAi
    ) {
      addForm.setValue("type", result.suggestion, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextProvenance.type = "ai";
      nextPrefilled.type = result.suggestion;
    }
    if (
      (result.fieldKey === "menuUrl" || result.fieldKey === "reservationUrl") &&
      typeof result.suggestion === "string"
    ) {
      const field = result.fieldKey;
      addForm.setValue(field, result.suggestion, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      nextProvenance[field] = "ai";
      nextPrefilled[field] = result.suggestion;
      onUrlSuggested?.(field);
    }
  }

  async function retryAiField(fieldKey: AiSuggestionFieldKey) {
    if (!isPrefillReady) return;
    const name = addForm.getValues("name").trim();
    const address = normalizeDiningAddress(addForm.getValues("address"));
    if (!name || !address) return;

    const currentTypeForm = addForm.getValues("type") || "";
    const wantsTypeFromAi =
      fieldKey === "type" ? true : !currentTypeForm || currentTypeForm === "other";

    setAiFieldStatus((prev) => ({
      ...prev,
      [fieldKey]: { state: "running", confidenceThreshold: AI_CONFIDENCE_THRESHOLD },
    }));

    let result: DiningFieldSuggestionResponse;
    try {
      result = await callAiSuggestion(fieldKey, {
        name,
        address,
        prefillType: currentTypeForm,
        currentIdealFor: addForm.getValues("idealFor") ?? [],
      });
    } catch (err) {
      setAiFieldStatus((prev) => ({ ...prev, [fieldKey]: statusFromThrown(err) }));
      return;
    }

    setAiFieldStatus((prev) => ({ ...prev, [fieldKey]: statusFromAiResult(result) }));

    if (result.suggestion == null || result.error) return;

    // Merge result into provenance/prefilled state, and re-arm verify-checkbox
    // for URL fields so the operator must re-acknowledge the new suggestion.
    const nextProvenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>> = {
      ...provenance,
    };
    const nextPrefilled: Partial<Record<ProvenanceTrackedField, string>> = {
      ...prefilledValues,
    };
    applyAiResultToForm(result, {
      wantsTypeFromAi,
      nextProvenance,
      nextPrefilled,
      onUrlSuggested: (urlField) => {
        setVerifiedAiUrls((prev) => ({ ...prev, [urlField]: false }));
      },
    });
    setProvenance(nextProvenance);
    setPrefilledValues(nextPrefilled);
  }

  async function handleGooglePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await addForm.trigger(["name", "address", "tripadvisorUrl"]);
    const tripadvisorIssue = validateTripadvisorEntry({
      tripadvisorUrl: addForm.getValues("tripadvisorUrl") || undefined,
      noTripadvisorListing: addForm.getValues("noTripadvisorListing"),
    });
    if (!isStepValid || tripadvisorIssue) {
      setPrefillSignature(null);
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setPrefillTripadvisorPlaceData(null);
      setProvenance({});
      setPrefilledValues({});
      if (tripadvisorIssue) {
        addForm.setError("tripadvisorUrl", {
          type: "manual",
          message: tripadvisorIssue,
        });
      }
      setPrefillError(
        tripadvisorIssue ||
          "Enter a valid name, address, and TripAdvisor URL (or check “No TripAdvisor listing”) before running Google lookup."
      );
      return false;
    }

    const name = addForm.getValues("name").trim();
    const normalizedAddress = normalizeDiningAddress(addForm.getValues("address"));
    addForm.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    const operatorTripadvisorUrl = (addForm.getValues("tripadvisorUrl") || "").trim();
    const noTripadvisorListing = addForm.getValues("noTripadvisorListing");

    setIsPrefillingGoogle(true);
    setAiBatchStep(noTripadvisorListing ? "google" : "tripadvisor");

    try {
      const prefill = await locationsApi.googlePrefill("dining", {
        name,
        address: normalizedAddress,
        tripadvisorUrl: operatorTripadvisorUrl || undefined,
        noTripadvisorListing: noTripadvisorListing || undefined,
      });

      addForm.setValue("googleUrl", prefill.googleUrl, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("placeId", prefill.placeId, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("latitude", String(prefill.lat), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("longitude", String(prefill.lng), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("locationKey", prefill.locationKey || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("district", prefill.district || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      addForm.setValue("ianaTimeId", prefill.ianaTimeId || "", {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });

      if (prefill.type) {
        addForm.setValue("type", prefill.type, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.tripadvisorUrl) {
        addForm.setValue("tripadvisorUrl", prefill.tripadvisorUrl, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.menuUrl) {
        addForm.setValue("menuUrl", prefill.menuUrl, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.reservationUrl) {
        addForm.setValue("reservationUrl", prefill.reservationUrl, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      setPrefillOperationHours(prefill.operationHours || null);
      setPrefillPhoneNumber(prefill.phoneNumber || null);
      setPrefillWebsite(prefill.website || null);
      setPrefillTripadvisorPlaceData(prefill.tripadvisorPlaceData || null);
      setPrefillSignature(buildDiningPrefillSignature(name, normalizedAddress));

      // Seed the title (operator-polished public-facing name) and the editable
      // contact fields from Google's prefill. Operator reviews them inline in
      // the Review section — replaces the prior post-Create Confirm phase.
      if (!addForm.getValues("title")) {
        addForm.setValue("title", name, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (!addForm.getValues("phoneNumber") && prefill.phoneNumber) {
        addForm.setValue("phoneNumber", prefill.phoneNumber, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (!addForm.getValues("website") && prefill.website) {
        addForm.setValue("website", prefill.website, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      const nextProvenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>> = {};
      const nextPrefilled: Partial<Record<ProvenanceTrackedField, string>> = {};
      for (const field of PROVENANCE_TRACKED_FIELDS) {
        const value = prefill[field];
        const raw = prefill.provenance?.[field];
        if (value && isFieldProvenanceValue(raw)) {
          nextProvenance[field] = raw;
          nextPrefilled[field] = value;
        }
      }

      // AI batch (slice D / ADR-0008). After Google prefill + (inline) TA fetch,
      // fire grounded suggestions for the AI-eligible dining fields in parallel.
      // `type` only runs when Google's deterministic mapping didn't yield a value.
      setAiBatchStep("ai");
      const wantsTypeFromAi = !prefill.type || prefill.type === "other";
      const fieldsToRun: AiSuggestionFieldKey[] = [
        "idealFor",
        "menuUrl",
        "reservationUrl",
      ];
      if (wantsTypeFromAi) fieldsToRun.push("type");

      // Reset status for every AI-eligible field — fields we don't run (e.g.
      // `type` when Google gave us one) go back to idle and won't render a badge.
      setAiFieldStatus(() => {
        const next = initialAiFieldStatusMap();
        for (const key of fieldsToRun) {
          next[key] = {
            state: "running",
            confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
          };
        }
        return next;
      });

      const aiResults = await Promise.allSettled(
        fieldsToRun.map((fieldKey) =>
          callAiSuggestion(fieldKey, {
            name,
            address: normalizedAddress,
            prefillType: prefill.type ?? "",
            currentIdealFor: addForm.getValues("idealFor") ?? [],
          })
        )
      );

      const nextVerifiedAiUrls: Record<"menuUrl" | "reservationUrl", boolean> = {
        menuUrl: true,
        reservationUrl: true,
      };
      const nextStatuses: Partial<Record<AiSuggestionFieldKey, AiFieldStatus>> = {};

      aiResults.forEach((settled, index) => {
        const fieldKey = fieldsToRun[index];
        if (settled.status !== "fulfilled") {
          nextStatuses[fieldKey] = statusFromThrown(settled.reason);
          return;
        }
        const result = settled.value;
        nextStatuses[fieldKey] = statusFromAiResult(result);

        if (result.suggestion == null || result.error) return;

        applyAiResultToForm(result, {
          wantsTypeFromAi,
          nextProvenance,
          nextPrefilled,
          onUrlSuggested: (urlField) => {
            nextVerifiedAiUrls[urlField] = false;
          },
        });
      });

      setAiFieldStatus((prev) => ({ ...prev, ...nextStatuses }));
      setVerifiedAiUrls(nextVerifiedAiUrls);
      setAiBatchStep(null);

      setProvenance(nextProvenance);
      setPrefilledValues(nextPrefilled);

      setPrefillMessage(
        "Google + TripAdvisor + AI suggestions complete. Review the highlighted fields before Create."
      );
      return true;
    } catch (lookupError) {
      const errorMessage =
        lookupError instanceof Error ? lookupError.message : "Google lookup failed";
      setPrefillSignature(null);
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setPrefillTripadvisorPlaceData(null);
      setProvenance({});
      setPrefilledValues({});
      setVerifiedAiUrls({ menuUrl: true, reservationUrl: true });
      setAiFieldStatus(initialAiFieldStatusMap());
      setPrefillError(errorMessage);
      return false;
    } finally {
      setIsPrefillingGoogle(false);
      setAiBatchStep(null);
    }
  }

  function buildDiningCreatePayload(data: AddDiningFormData) {
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
      reservationUrl: data.reservationUrl || undefined,
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

  function onCreateSuccess(response: Awaited<ReturnType<typeof locationsApi.createLocation>>) {
    setCreatedLocation({
      id: response.id,
      category: response.category,
      name: response.source.name,
      title: response.title || response.source.name,
      phoneNumber: response.contact?.phoneNumber || undefined,
      website: response.contact?.website || undefined,
      tripadvisorUrl: response.tripadvisorUrl,
      menuUrl: response.menuUrl,
      reservationUrl: response.reservationUrl,
      placeId: response.placeId,
    });
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setPrefillTripadvisorPlaceData(null);
    setProvenance({});
    setPrefilledValues({});
    setVerifiedAiUrls({ menuUrl: true, reservationUrl: true });
    setAiFieldStatus(initialAiFieldStatusMap());
    setPrefillMessage(null);
    setPrefillError(null);
    clearDiningDraftFromStorage();
  }

  function handleAddDining(
    data: AddDiningFormData,
    photoSession?: { sessionId: string; cropped: CroppedPhotoSource[] }
  ) {
    const submitValidation = addDiningSubmitSchema.safeParse({
      prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      setPrefillError(firstIssue || "Run Google lookup before creating the dining document.");
      return;
    }

    const payload = buildDiningCreatePayload(data);
    const hasPhotos = !!photoSession && photoSession.cropped.length > 0;

    if (!hasPhotos) {
      createLocation(payload, {
        onSuccess: (response) => {
          onCreateSuccess(response);
          setPhase("success");
        },
      });
      return;
    }

    // ADR-0007: single atomic multipart Create with all variants attached.
    setIsCreatingWithPhotos(true);
    setPhotoSubmitError(null);
    void (async () => {
      try {
        const response = await locationsApi.createLocationWithPhotos(
          payload,
          photoSession!.cropped.map((c) => ({
            sourceName: c.sourceName,
            sourceFile: c.sourceFile,
            variants: c.variants.map((v) => ({ type: v.type as string, file: v.file })),
            photographerCredit: c.photographerCredit,
          }))
        );
        onCreateSuccess(response);
        await addFlowPhotoSession.clearSession(photoSession!.sessionId).catch(() => undefined);
        navigate("/");
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Create with photos failed");
        setPhotoSubmitError(error);
        console.error("[useAddDiningFlow] createLocationWithPhotos failed", err);
      } finally {
        setIsCreatingWithPhotos(false);
      }
    })();
  }

  function handleReset() {
    setPhase("add");
    setCreatedLocation(null);
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setPrefillTripadvisorPlaceData(null);
    setProvenance({});
    setPrefilledValues({});
    setVerifiedAiUrls({ menuUrl: true, reservationUrl: true });
    setAiFieldStatus(initialAiFieldStatusMap());
    setPrefillMessage(null);
    setPrefillError(null);
    clearDiningDraftFromStorage();
  }

  function navigateHome() {
    navigate("/");
  }

  function acknowledgeAiUrl(field: "menuUrl" | "reservationUrl", verified: boolean) {
    setVerifiedAiUrls((prev) =>
      prev[field] === verified ? prev : { ...prev, [field]: verified }
    );
  }

  const allAiUrlsVerified =
    verifiedAiUrls.menuUrl && verifiedAiUrls.reservationUrl;

  return {
    phase,
    setPhase,
    createdLocation,
    addForm,
    locationTypes,
    isLoadingTypes,
    isCreating: isCreating || isCreatingWithPhotos,
    createError: photoSubmitError ?? createError,
    isPrefillingGoogle,
    aiBatchStep,
    prefillMessage,
    prefillError,
    prefillSignature,
    isPrefillReady,
    prefillIsStale,
    handleGooglePrefill,
    handleAddDining,
    handleReset,
    navigateHome,
    provenance,
    verifiedAiUrls,
    acknowledgeAiUrl,
    allAiUrlsVerified,
    aiFieldStatus,
    retryAiField,
  };
}
