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
import type { LocationCategory } from "@shared/types/location-category";
import type { ConfirmLocationFormData } from "../validation/add-location.schema";
import { confirmLocationSchema } from "../validation/add-location.schema";
import {
  addRestaurantSchema,
  addRestaurantSubmitSchema,
  buildRestaurantPrefillSignature,
  normalizeRestaurantAddress,
  type AddRestaurantFormData,
} from "../validation/add-restaurant.schema";

export type RestaurantPhase = "add" | "confirm" | "reviews" | "success";

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

const RESTAURANT_DRAFT_STORAGE_KEY = "lm:add-restaurant:draft:v1";

const RESTAURANT_FORM_DEFAULT_VALUES: AddRestaurantFormData = {
  name: "",
  address: "",
  type: "",
  idealFor: [],
  tripadvisorUrl: "",
  googleUrl: "",
  placeId: "",
  latitude: "",
  longitude: "",
  locationKey: "",
  district: "",
  ianaTimeId: "",
};

interface RestaurantDraftPayload {
  formValues: AddRestaurantFormData;
  prefillSignature: string | null;
  prefillOperationHours: Record<string, unknown> | null;
  prefillPhoneNumber: string | null;
  prefillWebsite: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDraftEffectivelyEmpty(payload: RestaurantDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  if (payload.prefillOperationHours !== null) return false;
  if (payload.prefillPhoneNumber !== null) return false;
  if (payload.prefillWebsite !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(RESTAURANT_FORM_DEFAULT_VALUES);
}

function clearRestaurantDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESTAURANT_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function readRestaurantDraftFromStorage(): RestaurantDraftPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(RESTAURANT_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<RestaurantDraftPayload>;
    const parsedValues = addRestaurantSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearRestaurantDraftFromStorage();
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
        ...RESTAURANT_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddRestaurantFormData>),
      },
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
    };
  } catch {
    clearRestaurantDraftFromStorage();
    return null;
  }
}

function writeRestaurantDraftToStorage(payload: RestaurantDraftPayload) {
  if (typeof window === "undefined") return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(RESTAURANT_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(RESTAURANT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (quota/private browsing/etc).
  }
}

export function useAddRestaurantFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<RestaurantPhase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [prefillOperationHours, setPrefillOperationHours] = useState<Record<string, unknown> | null>(null);
  const [prefillPhoneNumber, setPrefillPhoneNumber] = useState<string | null>(null);
  const [prefillWebsite, setPrefillWebsite] = useState<string | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("dining");

  const addForm = useForm<AddRestaurantFormData>({
    resolver: zodResolver(addRestaurantSchema),
    defaultValues: RESTAURANT_FORM_DEFAULT_VALUES,
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
    const draft = readRestaurantDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    addForm.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillOperationHours(draft.prefillOperationHours);
    setPrefillPhoneNumber(draft.prefillPhoneNumber);
    setPrefillWebsite(draft.prefillWebsite);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [addForm]);

  useEffect(() => {
    const subscription = addForm.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeRestaurantDraftToStorage({
        formValues: {
          ...RESTAURANT_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddRestaurantFormData>),
        },
        prefillSignature,
        prefillOperationHours,
        prefillPhoneNumber,
        prefillWebsite,
      });
    });

    return () => subscription.unsubscribe();
  }, [
    addForm,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
  ]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeRestaurantDraftToStorage({
      formValues: addForm.getValues(),
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
    });
  }, [
    addForm,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
  ]);

  const currentPrefillSignature = buildRestaurantPrefillSignature(
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
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return false;
    }

    const name = addForm.getValues("name").trim();
    const normalizedAddress = normalizeRestaurantAddress(addForm.getValues("address"));
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

      setPrefillOperationHours(prefill.operationHours || null);
      setPrefillPhoneNumber(prefill.phoneNumber || null);
      setPrefillWebsite(prefill.website || null);
      setPrefillSignature(buildRestaurantPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, website, and hours were prefilled when available."
      );
      return true;
    } catch (lookupError) {
      const errorMessage =
        lookupError instanceof Error ? lookupError.message : "Google lookup failed";
      setPrefillSignature(null);
      setPrefillOperationHours(null);
      setPrefillPhoneNumber(null);
      setPrefillWebsite(null);
      setPrefillError(errorMessage);
      return false;
    } finally {
      setIsPrefillingGoogle(false);
    }
  }

  function handleAddRestaurant(data: AddRestaurantFormData) {
    const submitValidation = addRestaurantSubmitSchema.safeParse({
      prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      setPrefillError(firstIssue || "Run Google lookup before creating the restaurant document.");
      return;
    }

    const lat = Number(data.latitude);
    const lng = Number(data.longitude);

    createLocation(
      {
        name: data.name,
        address: normalizeRestaurantAddress(data.address),
        category: "dining",
        type: data.type || undefined,
        idealFor: data.idealFor,
        tripadvisorUrl: data.tripadvisorUrl || undefined,
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
          addForm.reset(RESTAURANT_FORM_DEFAULT_VALUES);
          setPrefillSignature(null);
          setPrefillOperationHours(null);
          setPrefillPhoneNumber(null);
          setPrefillWebsite(null);
          setPrefillMessage(null);
          setPrefillError(null);
          clearRestaurantDraftFromStorage();
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
    addForm.reset(RESTAURANT_FORM_DEFAULT_VALUES);
    confirmForm.reset();
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setPrefillMessage(null);
    setPrefillError(null);
    clearRestaurantDraftFromStorage();
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
    handleAddRestaurant,
    handleConfirmTitle,
    handleReset,
    navigateHome,
  };
}
