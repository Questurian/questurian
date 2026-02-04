import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Clock } from "lucide-react";
import { editLocationSchema, type EditLocationFormData } from "../validation/edit-location.schema";
import { useLocationById, useUpdateLocation, useLocationTypes } from "@client/shared/services/api";
import { FormInput, FormSelect, FormTextarea } from "@client/shared/components/forms";
import { Button, SelectItem } from "@client/components/ui";
import { Field, FieldLabel } from "@client/shared/components/ui";
import { SubmitButton } from "@client/shared/components/ui";
import type { LocationCategory } from "@shared/types/location-category";

const OperationHoursModal = lazy(
  () =>
    import("@client/features/locations/components/ui/OperationHoursModal").then((m) => ({
      default: m.OperationHoursModal,
    }))
);

export function EditLocation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locationId = id ? parseInt(id, 10) : null;
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(undefined);
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId);
  const { mutate, isPending, isSuccess, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);
  const timezoneOptions = [
    { value: "America/Lima", label: "America/Lima (Peru)" },
    { value: "America/Bogota", label: "America/Bogota (Colombia)" },
    { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brazil)" },
    { value: "America/Rio_Branco", label: "America/Rio_Branco (Brazil)" },
    { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires (Argentina)" },
  ];

  const form = useForm<EditLocationFormData>({
    resolver: zodResolver(editLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      title: "",
      category: undefined,
      type: undefined,
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
      tripadvisorFeatures: "",
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
        type: location.type || undefined,
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
        tripadvisorFeatures: location.tripadvisorFeatures?.join(", ") || "",
      });

      console.log("📦 Form reset complete. Category value:", form.getValues("category"), "Type value:", form.getValues("type"));
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

    // Only include fields that have been explicitly set (not undefined)
    // Allow empty strings for fields like type that can be cleared
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

    mutate({ id: locationId, data: updateData });
  }

  if (isLoading) {
    return <div>Loading location...</div>;
  }

  if (fetchError) {
    return (
      <div>
        <p style={{ color: "red" }}>Error loading location: {fetchError.message}</p>
        <button onClick={() => navigate("/")}>Back to locations</button>
      </div>
    );
  }

  if (!location) {
    return (
      <div>
        <p>Location not found</p>
        <button onClick={() => navigate("/")}>Back to locations</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background" data-theme="dark">
      <div className="w-full max-w-[1200px] bg-background rounded-xl p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-theme="light">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">
            Edit Location
          </h1>
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Core
          </p>
          <FormInput
            name="name"
            label="Name"
            control={form.control}
            placeholder="Location name"
          />

          <FormSelect
            name="category"
            label="Category"
            control={form.control}
            placeholder="Select a category"
          >
            <SelectItem value="dining">Dining</SelectItem>
            <SelectItem value="accommodations">Accommodations</SelectItem>
            <SelectItem value="attractions">Attractions</SelectItem>
            <SelectItem value="nightlife">Nightlife</SelectItem>
          </FormSelect>

          <FormInput
            name="address"
            label="Address"
            control={form.control}
            placeholder="123 Main St, City, State, Country"
            description="Coordinates are locked and will not be re-geocoded."
          />

          <FormInput
            name="title"
            label="Title"
            control={form.control}
            placeholder="Location title"
          />

          <FormSelect
            name="type"
            label="Type"
            control={form.control}
            placeholder={isLoadingTypes ? "Loading types..." : "Select a type"}
            disabled={isLoadingTypes}
          >
            {locationTypes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </FormSelect>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Taxonomy
          </p>

          <FormInput
            name="locationKey"
            label="Location Key"
            control={form.control}
            placeholder="country|city|district"
          />

          <FormInput
            name="district"
            label="District"
            control={form.control}
            placeholder="District or neighborhood"
          />

          <FormInput
            name="countryCode"
            label="Country Code"
            control={form.control}
            placeholder="PE / CO / BR / AR"
          />
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </p>

          <FormSelect
            name="ianaTimeId"
            label="Time Zone (IANA)"
            control={form.control}
            placeholder="Select a time zone"
          >
            {timezoneOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </FormSelect>

          <FormInput
            name="contactAddress"
            label="Contact Address"
            control={form.control}
            placeholder="Contact address (optional)"
          />

          <FormInput
            name="phoneNumber"
            label="Phone Number"
            control={form.control}
            placeholder="Phone number (optional)"
          />

          <FormInput
            name="website"
            label="Website"
            control={form.control}
            placeholder="Website URL (optional)"
          />

          <FormInput
            name="email"
            label="Email"
            control={form.control}
            placeholder="Email address (optional)"
          />
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Details
          </p>

          <FormTextarea
            name="neighborhoodDescription"
            label="Neighborhood Description"
            control={form.control}
            placeholder="Short neighborhood description (optional)"
            rows={4}
          />

          <Field className="space-y-1.5">
            <FieldLabel>Operation hours</FieldLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setOperationHoursModalOpen(true)}
              >
                <Clock className="h-4 w-4" />
                {form.watch("operationHours")
                  ? "Edit schedule"
                  : "Set schedule"}
              </Button>
              {form.watch("operationHours") && (
                <span className="text-xs text-muted-foreground">
                  Schedule configured — open modal to edit
                </span>
              )}
            </div>
            {operationHoursModalOpen && (
              <Suspense fallback={null}>
                <OperationHoursModal
                  open={operationHoursModalOpen}
                  onOpenChange={setOperationHoursModalOpen}
                  value={form.watch("operationHours") ?? ""}
                  onSave={(json) => {
                    form.setValue("operationHours", json, { shouldDirty: true });
                  }}
                />
              </Suspense>
            )}
          </Field>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            External
          </p>

          <FormInput
            name="placeId"
            label="Google Place ID"
            control={form.control}
            placeholder="Place ID (optional)"
          />

          <FormInput
            name="tripadvisorUrl"
            label="TripAdvisor URL"
            control={form.control}
            placeholder="https://www.tripadvisor.com/..."
          />

          <FormTextarea
            name="tripadvisorMealTypes"
            label="TripAdvisor Meal Types"
            control={form.control}
            placeholder="Comma or line-separated (e.g. Lunch, Dinner, Drinks)"
            description="Safety override. Leave blank to keep current value."
            rows={2}
          />

          <FormTextarea
            name="tripadvisorCuisines"
            label="TripAdvisor Cuisines"
            control={form.control}
            placeholder="Comma or line-separated cuisines"
            description="Safety override. Leave blank to keep current value."
            rows={2}
          />

          <FormTextarea
            name="tripadvisorFeatures"
            label="TripAdvisor Features"
            control={form.control}
            placeholder="Comma or line-separated features"
            description="Safety override. Leave blank to keep current value."
            rows={3}
          />
        </div>

        <div className="space-y-2 mt-6">
          <SubmitButton
            isLoading={isPending}
            submitText="Update Location"
            submittingText="Updating Location..."
            disabled={!form.formState.isDirty}
            className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
          />
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full h-10 text-sm font-normal bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-border rounded-md"
          >
            Cancel
          </button>
        </div>

        {updateError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            Error: {updateError.message}
          </div>
        )}

        {isSuccess && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-600">
            Location updated successfully! Redirecting...
          </div>
        )}
      </form>
      </div>
    </div>
  );
}
