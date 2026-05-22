import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  useCreateLocation,
  useLocationTypes,
  useUpdateLocation,
} from "@client/shared/services/api/hooks";
import { locationsApi } from "@client/shared/services/api";
import { addFlowPhotoSession } from "../lib/add-flow-photo-session";
import type { CroppedPhotoSource } from "../components/PhotoImportPhase";
import type { LocationCategory } from "@shared/types/location-category";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { ConfirmLocationFormData } from "../validation/add-location.schema";
import { confirmLocationSchema } from "../validation/add-location.schema";
import {
  addDiningSchema,
  addDiningSubmitSchema,
  buildDiningPrefillSignature,
  normalizeDiningAddress,
  type AddDiningFormData,
} from "../validation/add-dining.schema";

export type DiningPhase = "add" | "confirm" | "stage2" | "success";

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
  type: "",
  idealFor: [],
  tripadvisorUrl: "",
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

    return {
      formValues: {
        ...DINING_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddDiningFormData>),
      },
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
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
  const [provenance, setProvenance] = useState<Partial<Record<ProvenanceTrackedField, FieldProvenance>>>({});
  const [prefilledValues, setPrefilledValues] = useState<Partial<Record<ProvenanceTrackedField, string>>>({});
  const hasHydratedDraftRef = useRef(false);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const [photoSubmitError, setPhotoSubmitError] = useState<Error | null>(null);
  const [isCreatingWithPhotos, setIsCreatingWithPhotos] = useState(false);
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("dining");

  const addForm = useForm<AddDiningFormData>({
    resolver: zodResolver(addDiningSchema),
    defaultValues: DINING_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const confirmForm = useForm<ConfirmLocationFormData>({
    resolver: zodResolver(confirmLocationSchema),
    defaultValues: {
      title: "",
      phoneNumber: "",
      website: "",
    },
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
      provenance,
      prefilledValues,
    });
  }, [
    addForm,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
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
  // Operator edit ⇒ field is operator-owned ⇒ no badge.
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
      }
    });

    return () => subscription.unsubscribe();
  }, [addForm, prefilledValues]);

  async function handleGooglePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await addForm.trigger(["name", "address"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setProvenance({});
      setPrefilledValues({});
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return false;
    }

    const name = addForm.getValues("name").trim();
    const normalizedAddress = normalizeDiningAddress(addForm.getValues("address"));
    addForm.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("dining", {
        name,
        address: normalizedAddress,
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
      setPrefillSignature(buildDiningPrefillSignature(name, normalizedAddress));

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
      setProvenance(nextProvenance);
      setPrefilledValues(nextPrefilled);

      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, website, hours, type, TripAdvisor URL, menu URL, and reservation URL were prefilled when available."
      );
      return true;
    } catch (lookupError) {
      const errorMessage =
        lookupError instanceof Error ? lookupError.message : "Google lookup failed";
      setPrefillSignature(null);
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setProvenance({});
      setPrefilledValues({});
      setPrefillError(errorMessage);
      return false;
    } finally {
      setIsPrefillingGoogle(false);
    }
  }

  function buildDiningCreatePayload(data: AddDiningFormData) {
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    return {
      name: data.name,
      address: normalizeDiningAddress(data.address),
      category: "dining" as const,
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
      district: data.district || undefined,
      ianaTimeId: data.ianaTimeId || undefined,
      operationHours: prefillOperationHours || undefined,
      phoneNumber: prefillPhoneNumber || undefined,
      website: prefillWebsite || undefined,
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
    confirmForm.setValue("title", response.title || response.source.name);
    confirmForm.setValue("phoneNumber", response.contact?.phoneNumber || "");
    confirmForm.setValue("website", response.contact?.website || "");
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setProvenance({});
    setPrefilledValues({});
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
          setPhase("confirm");
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

  function handleConfirmTitle(data: ConfirmLocationFormData) {
    if (!createdLocation) return;

    updateLocation(
      {
        category: createdLocation.category,
        id: createdLocation.id,
        data: {
          title: data.title,
          phoneNumber: data.phoneNumber,
          website: data.website,
        },
      },
      {
        onSuccess: () => {
          setPhase("stage2");
        },
      }
    );
  }

  function handleReset() {
    setPhase("add");
    setCreatedLocation(null);
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    confirmForm.reset();
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setProvenance({});
    setPrefilledValues({});
    setPrefillMessage(null);
    setPrefillError(null);
    clearDiningDraftFromStorage();
  }

  function navigateHome() {
    navigate("/");
  }

  return {
    phase,
    setPhase,
    createdLocation,
    addForm,
    confirmForm,
    locationTypes,
    isLoadingTypes,
    isCreating: isCreating || isCreatingWithPhotos,
    createError: photoSubmitError ?? createError,
    isUpdating,
    updateError,
    isPrefillingGoogle,
    prefillMessage,
    prefillError,
    prefillSignature,
    isPrefillReady,
    prefillIsStale,
    handleGooglePrefill,
    handleAddDining,
    handleConfirmTitle,
    handleReset,
    navigateHome,
    provenance,
  };
}
