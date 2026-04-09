import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

const VALID_CATEGORIES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

export function useEditLocationForm() {
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();
  const navigate = useNavigate();
  const locationId = id ? parseInt(id, 10) : null;
  const routeCategory = VALID_CATEGORIES.includes((category || "") as LocationCategory)
    ? (category as LocationCategory)
    : null;
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(
    routeCategory ?? undefined
  );
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId, routeCategory);
  const { mutate, isPending, isSuccess, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);

  const form = useForm<EditLocationFormData>({
    resolver: zodResolver(editLocationSchema),
    defaultValues: {
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
      email: "",
      neighborhoodDescription: "",
      operationHours: "",
      tripadvisorUrl: "",
      tripadvisorMealTypes: "",
      tripadvisorCuisines: "",
      keyLocationsDetails: "",
    },
  });

  // Pre-populate form when location data is loaded
  useEffect(() => {
    if (location) {
      setSelectedCategory(location.category);
      form.reset({
        name: location.source?.name || "",
        address: location.source?.address || "",
        title: location.title || "",
        idealFor: location.category === "attractions" ? undefined : (location.idealFor || []),
        type: location.type || undefined,
        priceLevel: location.priceLevel || "",
        locationKey: location.locationKey || "",
        district: location.district || "",
        countryCode: location.contact.countryCode || "",
        ianaTimeId: location.ianaTimeId || "",
        placeId: location.placeId || "",
        phoneNumber: location.contact.phoneNumber || "",
        website: location.contact.website || "",
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
      });
    }
  }, [location, form]);

  // Redirect on successful update
  useEffect(() => {
    if (isSuccess) {
      navigate("/");
    }
  }, [isSuccess, navigate]);

  function handleSubmit(data: EditLocationFormData) {
    if (!locationId) return;

    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    ) as UpdateMapsRequest;
    const taxonomyDirty = Boolean(
      form.formState.dirtyFields.locationKey ||
      form.formState.dirtyFields.district
    );
    const hasLocationKey = typeof data.locationKey === "string" && data.locationKey.trim().length > 0;

    if (taxonomyDirty && hasLocationKey) {
      updateData.autoApproveTaxonomy = true;
    }

    const categoryForUpdate = routeCategory || location?.category || null;
    if (!categoryForUpdate) return;

    mutate({ category: categoryForUpdate, id: locationId, data: updateData });
  }

  function navigateHome() {
    navigate("/");
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
    navigateHome,
  };
}
