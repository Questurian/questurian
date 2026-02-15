import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editLocationSchema, type EditLocationFormData } from "../validation/edit-location.schema";
import { useLocationById, useUpdateLocation, useLocationTypes } from "@client/shared/services/api";
import type { LocationCategory } from "@shared/types/location-category";

export function useEditLocationForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locationId = id ? parseInt(id, 10) : null;
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(undefined);
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId);
  const { mutate, isPending, isSuccess, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);

  const form = useForm<EditLocationFormData>({
    resolver: zodResolver(editLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      title: "",
      category: undefined,
      idealFor: [],
      type: undefined,
      priceLevel: "",
      locationKey: "",
      district: "",
      contactAddress: "",
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
        category: location.category,
        idealFor: location.idealFor || [],
        type: location.type || undefined,
        priceLevel: location.priceLevel || "",
        locationKey: location.locationKey || "",
        district: location.district || "",
        contactAddress: location.contact.contactAddress || "",
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
      });
    }
  }, [location, form]);

  const watchedCategory = form.watch("category");
  useEffect(() => {
    if (watchedCategory === undefined) return;
    if (selectedCategory === undefined) {
      setSelectedCategory(watchedCategory);
      return;
    }
    if (watchedCategory !== selectedCategory) {
      setSelectedCategory(watchedCategory);
      form.setValue("type", "");
    }
  }, [watchedCategory, selectedCategory, form]);

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
    );

    mutate({ id: locationId, data: updateData });
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
