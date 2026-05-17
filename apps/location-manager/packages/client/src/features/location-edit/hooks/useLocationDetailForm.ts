import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editLocationSchema, type EditLocationFormData } from "../validation/edit-location.schema";
import {
  useLocationById,
  useUpdateLocation,
  useLocationTypes,
  type UpdateMapsRequest,
} from "@client/shared/services/api";
import type { LocationCategory } from "@shared/types/location-category";

interface UseLocationDetailFormOptions {
  locationId: number | null;
  category: LocationCategory | null;
  /** When true, refetch every 10s with a 2-minute ceiling. Used post-create to pick up late Stage-2 suggestions. */
  pollForSuggestions?: boolean;
  /** Called after a successful batch update. Defaults to no-op (component stays mounted). */
  onUpdateSuccess?: () => void;
}

const POLL_INTERVAL_MS = 10_000;
const POLL_CEILING_MS = 120_000;

export function useLocationDetailForm({
  locationId,
  category,
  pollForSuggestions = false,
  onUpdateSuccess,
}: UseLocationDetailFormOptions) {
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  const [pollExpired, setPollExpired] = useState(false);

  const {
    data: location,
    isLoading,
    error: fetchError,
    refetch,
  } = useLocationById(locationId, category);

  useEffect(() => {
    if (!pollForSuggestions || pollExpired) return;
    const ceiling = window.setTimeout(() => setPollExpired(true), POLL_CEILING_MS);
    const interval = window.setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(ceiling);
      window.clearInterval(interval);
    };
  }, [pollForSuggestions, pollExpired, refetch]);

  const { mutate, isPending, isSuccess, error: updateError, reset: resetMutation } =
    useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(
    category ?? undefined
  );

  // `values` is reactive — when the location updates (after a pending-suggestion
  // accept, after a batch save, after polling picks up Stage-2 output), RHF
  // re-syncs the form to the new server state. `keepDirtyValues: true` preserves
  // any in-flight operator edit to a dirty field, so we never silently overwrite
  // the operator's work. Untouched fields pick up server changes automatically.
  const values = useMemo<EditLocationFormData>(
    () => (location ? locationToFormValues(location) : emptyFormValues()),
    [location]
  );

  const form = useForm<EditLocationFormData>({
    resolver: zodResolver(editLocationSchema),
    defaultValues: emptyFormValues(),
    values,
    resetOptions: { keepDirtyValues: true, keepDefaultValues: false },
  });

  // Fire onUpdateSuccess once per successful update, then clear the mutation
  // state so isDirty-driven UI can rearm cleanly.
  useEffect(() => {
    if (!isSuccess) return;
    onUpdateSuccess?.();
    resetMutation();
  }, [isSuccess, onUpdateSuccess, resetMutation]);

  // Route-away guard while the batch is dirty.
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [form.formState.isDirty]);

  function handleSubmit(data: EditLocationFormData) {
    if (!locationId || !category) return;

    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    ) as UpdateMapsRequest;

    const taxonomyDirty = Boolean(
      form.formState.dirtyFields.locationKey || form.formState.dirtyFields.district
    );
    const hasLocationKey =
      typeof data.locationKey === "string" && data.locationKey.trim().length > 0;
    if (taxonomyDirty && hasLocationKey) {
      updateData.autoApproveTaxonomy = true;
    }

    mutate({ category, id: locationId, data: updateData });
  }

  function cancelChanges() {
    // Cancel discards in-flight edits — explicitly disable keepDirtyValues here
    // (the hook's default keeps them so server-side syncs don't blow away edits).
    if (location) form.reset(locationToFormValues(location), { keepDirtyValues: false });
  }

  return {
    form,
    location,
    isLoading,
    fetchError,
    isPending,
    updateError,
    isLoadingTypes,
    locationTypes,
    operationHoursModalOpen,
    setOperationHoursModalOpen,
    handleSubmit,
    cancelChanges,
  };
}

function emptyFormValues(): EditLocationFormData {
  return {
    name: "",
    address: "",
    title: "",
    idealFor: undefined,
    type: undefined,
    priceLevel: "",
    locationKey: "",
    district: "",
    countryCode: "",
    ianaTimeId: "",
    placeId: "",
    phoneNumber: "",
    website: "",
    menuUrl: "",
    reservationUrl: "",
    email: "",
    neighborhoodDescription: "",
    operationHours: "",
    tripadvisorUrl: "",
    tripadvisorMealTypes: "",
    tripadvisorCuisines: "",
    keyLocationsDetails: "",
  };
}

function locationToFormValues(
  location: NonNullable<ReturnType<typeof useLocationById>["data"]>
): EditLocationFormData {
  return {
    name: location.source?.name || "",
    address: location.source?.address || "",
    title: location.title || "",
    idealFor: location.category === "attractions" ? undefined : location.idealFor || [],
    type: location.type || undefined,
    priceLevel: location.priceLevel || "",
    locationKey: location.locationKey || "",
    district: location.district || "",
    countryCode: location.contact.countryCode || "",
    ianaTimeId: location.ianaTimeId || "",
    placeId: location.placeId || "",
    phoneNumber: location.contact.phoneNumber || "",
    website: location.contact.website || "",
    menuUrl: location.menuUrl || "",
    reservationUrl: location.reservationUrl || "",
    email: location.contact.email || "",
    neighborhoodDescription: location.neighborhoodDescription || "",
    operationHours: location.operationHours
      ? JSON.stringify(location.operationHours, null, 2)
      : "",
    tripadvisorUrl: location.tripadvisorUrl || "",
    tripadvisorMealTypes: location.tripadvisorMealTypes?.join(", ") || "",
    tripadvisorCuisines: location.tripadvisorCuisines?.join(", ") || "",
    keyLocationsDetails: location.keyLocationsDetails
      ? JSON.stringify(location.keyLocationsDetails, null, 2)
      : "",
  };
}
