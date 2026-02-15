import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useCreateLocation, useUpdateLocation, useLocationTypes } from "@client/shared/services/api";
import {
  addLocationSchema,
  confirmLocationSchema,
  type AddLocationFormData,
  type ConfirmLocationFormData,
} from "../validation/add-location.schema";
import type { LocationCategory } from "@shared/types/location-category";

export type Phase = "add" | "confirm" | "reviews" | "success" | "batch-input" | "batch-processing" | "batch-complete";

interface CreatedLocation {
  id: number;
  name: string;
  title: string;
  phoneNumber?: string;
  website?: string;
  tripadvisorUrl?: string | null;
  placeId?: string | null;
}

export function useAddLocationFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(undefined);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);

  const addForm = useForm<AddLocationFormData>({
    resolver: zodResolver(addLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      category: undefined,
      idealFor: [],
      type: undefined,
      tripadvisorUrl: "",
    },
  });

  const watchedCategory = addForm.watch("category");
  useEffect(() => {
    if (watchedCategory !== selectedCategory) {
      setSelectedCategory(watchedCategory);
      addForm.setValue("type", undefined);
    }
  }, [watchedCategory, selectedCategory, addForm]);

  const confirmForm = useForm<ConfirmLocationFormData>({
    resolver: zodResolver(confirmLocationSchema),
    defaultValues: {
      title: "",
      phoneNumber: "",
      website: "",
    },
  });

  function handleAddLocation(data: AddLocationFormData) {
    createLocation(data, {
      onSuccess: (response) => {
        setCreatedLocation({
          id: response.id,
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
        addForm.reset();
      },
      onError: (error) => {
        console.error("Create location error:", error);
      },
    });
  }

  function handleConfirmTitle(data: ConfirmLocationFormData) {
    if (!createdLocation) return;

    updateLocation({
      id: createdLocation.id,
      data: {
        title: data.title,
        phoneNumber: data.phoneNumber,
        website: data.website,
      },
    }, {
      onSuccess: () => {
        setPhase("reviews");
      },
      onError: (error) => {
        console.error("Update location error:", error);
        alert(`Update failed: ${error.message}`);
      },
    });
  }

  function handleReset() {
    setPhase("add");
    setCreatedLocation(null);
    setSelectedCategory(undefined);
    confirmForm.reset();
    addForm.reset();
  }

  function navigateHome() {
    navigate("/");
  }

  return {
    phase,
    setPhase,
    createdLocation,
    selectedCategory,
    addForm,
    confirmForm,
    locationTypes,
    isLoadingTypes,
    isCreating,
    createError,
    isUpdating,
    updateError,
    handleAddLocation,
    handleConfirmTitle,
    handleReset,
    navigateHome,
  };
}
