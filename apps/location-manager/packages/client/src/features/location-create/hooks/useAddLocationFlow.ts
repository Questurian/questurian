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
import type { Phase } from "../types/location-create.types";

export type { Phase };

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

function getDefaultAddValues(forcedCategory?: LocationCategory): Partial<AddLocationFormData> {
  return {
    name: "",
    address: "",
    category: forcedCategory,
    idealFor: [],
    type: undefined,
    tripadvisorUrl: "",
  };
}

export function useAddLocationFlow(forcedCategory?: LocationCategory) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(forcedCategory);

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);

  const addForm = useForm<AddLocationFormData>({
    resolver: zodResolver(addLocationSchema),
    defaultValues: getDefaultAddValues(forcedCategory),
  });

  const watchedCategory = addForm.watch("category");
  useEffect(() => {
    if (forcedCategory) {
      if (watchedCategory !== forcedCategory) {
        addForm.setValue("category", forcedCategory, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: true,
        });
      }
      if (selectedCategory !== forcedCategory) {
        setSelectedCategory(forcedCategory);
      }
      return;
    }

    if (watchedCategory !== selectedCategory) {
      setSelectedCategory(watchedCategory);
      addForm.setValue("type", undefined);
    }
  }, [watchedCategory, selectedCategory, addForm, forcedCategory]);

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
        addForm.reset(getDefaultAddValues(forcedCategory));
      },
      onError: (error) => {
        console.error("Create location error:", error);
      },
    });
  }

  function handleConfirmTitle(data: ConfirmLocationFormData) {
    if (!createdLocation) return;

    updateLocation({
      category: createdLocation.category,
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
    setSelectedCategory(forcedCategory);
    confirmForm.reset();
    addForm.reset(getDefaultAddValues(forcedCategory));
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
