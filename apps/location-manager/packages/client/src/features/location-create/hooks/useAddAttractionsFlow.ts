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
import { buildAttractionsDetails } from "@client/shared/lib/attractions-details";
import type { LocationCategory } from "@shared/types/location-category";
import type { ConfirmLocationFormData } from "../validation/add-location.schema";
import { confirmLocationSchema } from "../validation/add-location.schema";
import {
  addAttractionsSchema,
  addAttractionsSubmitSchema,
  buildAttractionsOperationHours,
  buildAttractionsPrefillSignature,
  normalizeAttractionsAddress,
  type AddAttractionsFormData,
} from "../validation/add-attractions.schema";

export type AttractionsPhase = "add" | "confirm" | "reviews" | "success";

interface CreatedLocation {
  id: number;
  category: LocationCategory;
  name: string;
  title: string;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string | null;
  placeId?: string | null;
}

const ATTRACTIONS_DRAFT_STORAGE_KEY = "lm:add-attractions:draft:v1";

const ATTRACTIONS_FORM_DEFAULT_VALUES: AddAttractionsFormData = {
  name: "",
  address: "",
  type: "",
  priceLevel: "free",
  bookingRequired: "no",
  website: "",
  phone: "",
  tripadvisorUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
  hours: "",
};

interface AttractionsDraftPayload {
  formValues: AddAttractionsFormData;
  prefillSignature: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDraftEffectivelyEmpty(payload: AttractionsDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(ATTRACTIONS_FORM_DEFAULT_VALUES);
}

function clearAttractionsDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ATTRACTIONS_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function readAttractionsDraftFromStorage(): AttractionsDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ATTRACTIONS_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AttractionsDraftPayload>;
    const parsedValues = addAttractionsSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearAttractionsDraftFromStorage();
      return null;
    }

    const prefillSignature =
      typeof parsed.prefillSignature === "string" ? parsed.prefillSignature : null;

    return {
      formValues: {
        ...ATTRACTIONS_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddAttractionsFormData>),
      },
      prefillSignature,
    };
  } catch {
    clearAttractionsDraftFromStorage();
    return null;
  }
}

function writeAttractionsDraftToStorage(payload: AttractionsDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(ATTRACTIONS_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ATTRACTIONS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

export function useAddAttractionsFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<AttractionsPhase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("attractions");

  const addForm = useForm<AddAttractionsFormData>({
    resolver: zodResolver(addAttractionsSchema),
    defaultValues: ATTRACTIONS_FORM_DEFAULT_VALUES,
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
    const draft = readAttractionsDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    addForm.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [addForm]);

  useEffect(() => {
    const subscription = addForm.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeAttractionsDraftToStorage({
        formValues: {
          ...ATTRACTIONS_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddAttractionsFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [addForm, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeAttractionsDraftToStorage({
      formValues: addForm.getValues(),
      prefillSignature,
    });
  }, [addForm, prefillSignature]);

  const currentPrefillSignature = buildAttractionsPrefillSignature(
    addForm.watch("name"),
    addForm.watch("address")
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;

  async function handleGooglePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await addForm.trigger(["name", "address"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return false;
    }

    const name = addForm.getValues("name").trim();
    const normalizedAddress = normalizeAttractionsAddress(addForm.getValues("address"));
    addForm.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("attractions", {
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

      if (prefill.website && !addForm.getValues("website")) {
        addForm.setValue("website", prefill.website, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      if (prefill.phoneNumber && !addForm.getValues("phone")) {
        addForm.setValue("phone", prefill.phoneNumber, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      if (isRecord(prefill.operationHours)) {
        addForm.setValue("hours", JSON.stringify(prefill.operationHours, null, 2), {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      setPrefillSignature(buildAttractionsPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, hours, and contact fields were prefilled when available."
      );
      return true;
    } catch (lookupError) {
      const errorMessage =
        lookupError instanceof Error ? lookupError.message : "Google lookup failed";
      setPrefillSignature(null);
      setPrefillError(errorMessage);
      return false;
    } finally {
      setIsPrefillingGoogle(false);
    }
  }

  function handleAddAttractions(data: AddAttractionsFormData) {
    const submitValidation = addAttractionsSubmitSchema.safeParse({
      prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      setPrefillError(firstIssue || "Run Google lookup before creating the attractions document.");
      return;
    }

    const lat = Number(data.latitude);
    const lng = Number(data.longitude);

    const operationHours = buildAttractionsOperationHours(data);
    const attractionsDetails = buildAttractionsDetails({
      type: data.type,
      pricing: data.priceLevel,
      locationKey: data.locationKey || "",
      district: data.district || undefined,
      hours: operationHours,
      bookingRequired: data.bookingRequired === "yes",
      website: data.website || undefined,
      phone: data.phone || null,
      googleUrl: data.googleUrl,
    });

    createLocation(
      {
        name: data.name,
        address: normalizeAttractionsAddress(data.address),
        category: "attractions",
        type: data.type,
        priceLevel: data.priceLevel,
        tripadvisorUrl: data.tripadvisorUrl || undefined,
        url: data.googleUrl || undefined,
        placeId: data.placeId || undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        locationKey: data.locationKey || undefined,
        district: data.district || undefined,
        ianaTimeId: data.ianaTimeId || undefined,
        operationHours,
        website: data.website || undefined,
        phoneNumber: data.phone || undefined,
        attractionsDetails,
      },
      {
        onSuccess: (response) => {
          setCreatedLocation({
            id: response.id,
            category: response.category,
            name: response.source.name,
            title: response.title || response.source.name,
            phoneNumber: response.contact?.phoneNumber || undefined,
            website: response.contact?.website || undefined,
            tripadvisorUrl: response.tripadvisorUrl,
            placeId: response.placeId,
          });
          confirmForm.setValue("title", response.title || response.source.name);
          confirmForm.setValue("phoneNumber", response.contact?.phoneNumber || "");
          confirmForm.setValue("website", response.contact?.website || "");
          setPhase("confirm");
          addForm.reset(ATTRACTIONS_FORM_DEFAULT_VALUES);
          setPrefillSignature(null);
          setPrefillMessage(null);
          setPrefillError(null);
          clearAttractionsDraftFromStorage();
        },
      }
    );
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
          setPhase("reviews");
        },
      }
    );
  }

  function handleReset() {
    setPhase("add");
    setCreatedLocation(null);
    addForm.reset(ATTRACTIONS_FORM_DEFAULT_VALUES);
    confirmForm.reset();
    setPrefillSignature(null);
    setPrefillMessage(null);
    setPrefillError(null);
    clearAttractionsDraftFromStorage();
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
    isCreating,
    createError,
    isUpdating,
    updateError,
    isPrefillingGoogle,
    prefillMessage,
    prefillError,
    prefillSignature,
    isPrefillReady,
    prefillIsStale,
    handleGooglePrefill,
    handleAddAttractions,
    handleConfirmTitle,
    handleReset,
    navigateHome,
  };
}
