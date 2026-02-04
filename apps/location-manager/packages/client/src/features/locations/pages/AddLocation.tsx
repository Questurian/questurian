import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addLocationSchema, confirmLocationSchema, type AddLocationFormData, type ConfirmLocationFormData } from "../validation/add-location.schema";
import { useCreateLocation, useUpdateLocation, useLocationTypes } from "@client/shared/services/api";
import { FormInput, FormSelect, FormTagMultiSelect } from "@client/shared/components/forms";
import { SelectItem } from "@client/components/ui";
import { SubmitButton } from "@client/shared/components/ui";
import { MapPin, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { LocationCategory } from "@shared/types/location-category";
import { IDEAL_FOR_TAG_GROUPS } from "@shared/types/location-ideal-for";
import { ReviewsFetchPhase } from "../components/add/ReviewsFetchPhase";

type Phase = "add" | "confirm" | "reviews" | "success";
const IDEAL_FOR_OPTION_GROUPS = IDEAL_FOR_TAG_GROUPS.map((group) => ({
  label: group.label,
  options: group.tags.map((tag) => ({ value: tag, label: tag })),
}));

export function AddLocation() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("add");
  const [createdLocation, setCreatedLocation] = useState<{
    id: number;
    name: string;
    title: string;
    phoneNumber?: string;
    website?: string;
    tripadvisorUrl?: string | null;
    placeId?: string | null;
  } | null>(null);
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

  // Watch category changes to update selectedCategory and clear type
  const watchedCategory = addForm.watch("category");
  useEffect(() => {
    if (watchedCategory !== selectedCategory) {
      setSelectedCategory(watchedCategory);
      // Clear type when category changes
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
        website: data.website
      }
    }, {
      onSuccess: () => {
        // Go to reviews phase instead of success
        setPhase("reviews");
      },
      onError: (error) => {
        console.error("Update location error:", error);
        // Show the error to the user
        alert(`Update failed: ${error.message}`);
      },
    });
  }

  if (phase === "confirm" && createdLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header with icon and title */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Confirm Location Details</h1>
          </div>

          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ Location "{createdLocation.name}" added successfully!
            </p>
          </div>

          <form onSubmit={confirmForm.handleSubmit(handleConfirmTitle)} className="space-y-4">
            <FormInput
              name="title"
              label="Display Title"
              control={confirmForm.control}
              placeholder="Clean display title"
              description={`Current: "${createdLocation.title}"`}
            />

            <FormInput
              name="phoneNumber"
              label="Phone Number"
              control={confirmForm.control}
              placeholder="Phone number (optional)"
              description={`Current: ${createdLocation.phoneNumber || "None"}`}
            />

            <FormInput
              name="website"
              label="Website"
              control={confirmForm.control}
              placeholder="https://example.com (optional)"
              description={`Current: ${createdLocation.website || "None"}`}
            />

            <SubmitButton
              isLoading={isUpdating}
              submitText="Confirm Details"
              submittingText="Updating..."
              disabled={!confirmForm.formState.isValid}
              className="w-full h-10 mt-2 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            />

            {updateError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                Error: {updateError.message}
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (phase === "reviews" && createdLocation) {
    return (
      <ReviewsFetchPhase
        locationId={createdLocation.id}
        locationName={createdLocation.title || createdLocation.name}
        tripadvisorUrl={createdLocation.tripadvisorUrl || null}
        placeId={createdLocation.placeId || null}
        onComplete={() => setPhase("success")}
        onSkip={() => setPhase("success")}
      />
    );
  }

  if (phase === "success" && createdLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header with icon and title */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Location Added Successfully</h1>
          </div>

          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ Location "{createdLocation.title}" has been added successfully!
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setPhase("add");
                setCreatedLocation(null);
                setSelectedCategory(undefined);
                confirmForm.reset();
                addForm.reset();
              }}
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-normal"
            >
              Add Another Location
            </button>

            <button
              onClick={() => {
                navigate("/");
              }}
              className="w-full h-10 bg-muted text-muted-foreground hover:bg-muted/90 rounded-md text-sm font-normal"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header with icon and title */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <MapPin className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Add Location</h1>
        </div>

        <form onSubmit={addForm.handleSubmit(handleAddLocation)} className="space-y-4">
          <FormInput
            name="name"
            label="Name"
            control={addForm.control}
            placeholder="Location Name"
          />

          <FormInput
            name="address"
            label="Address"
            control={addForm.control}
            placeholder="123 Main St, City, State, Country"
          />

          <FormSelect
            name="category"
            label="Category"
            control={addForm.control}
            placeholder="Select a category"
          >
            <SelectItem value="dining">Dining</SelectItem>
            <SelectItem value="accommodations">Accommodations</SelectItem>
            <SelectItem value="attractions">Attractions</SelectItem>
            <SelectItem value="nightlife">Nightlife</SelectItem>
          </FormSelect>

          {selectedCategory && (
            <FormSelect
              name="type"
              label="Type"
              control={addForm.control}
              placeholder={isLoadingTypes ? "Loading types..." : "Select a type"}
              disabled={isLoadingTypes}
            >
              {locationTypes.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </FormSelect>
          )}

          <FormTagMultiSelect
            name="idealFor"
            label="Ideal For"
            control={addForm.control}
            optionGroups={IDEAL_FOR_OPTION_GROUPS}
            maxSelections={4}
            description="Choose 1 to 4 tags"
          />

          <FormInput
            name="tripadvisorUrl"
            label="TripAdvisor URL"
            control={addForm.control}
            placeholder="https://www.tripadvisor.com/..."
            description="Optional — used to extract the TripAdvisor location ID"
          />

          <SubmitButton
            isLoading={isCreating}
            submitText="Add Location"
            submittingText="Adding Location..."
            disabled={!addForm.formState.isValid}
            className="w-full h-10 mt-2 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
          />

          {createError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              Error: {createError.message}
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
