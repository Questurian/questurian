import type { UseFormReturn } from "react-hook-form";
import { MapPin, Upload } from "lucide-react";
import { FormInput, FormSelect, FormTagMultiSelect } from "@client/shared/components/forms";
import { SelectItem } from "@client/components/ui";
import { SubmitButton } from "@client/shared/components/ui";
import { Button } from "@client/components/ui/button";
import { IDEAL_FOR_OPTION_GROUPS } from "../constants/ai-prompt-template";
import type { AddLocationFormData } from "../validation/add-location.schema";
import type { LocationCategory } from "@shared/types/location-category";

interface AddLocationFormProps {
  form: UseFormReturn<AddLocationFormData>;
  onSubmit: (data: AddLocationFormData) => void;
  isCreating: boolean;
  createError: Error | null;
  selectedCategory: LocationCategory | undefined;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  onBatchClick: () => void;
}

export function AddLocationForm({
  form,
  onSubmit,
  isCreating,
  createError,
  selectedCategory,
  locationTypes,
  isLoadingTypes,
  onBatchClick,
}: AddLocationFormProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <MapPin className="w-4 h-4 text-muted-foreground" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Add Location</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBatchClick}
            className="flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Batch
          </Button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormInput
            name="name"
            label="Name"
            control={form.control}
            placeholder="Location Name"
          />

          <FormInput
            name="address"
            label="Address"
            control={form.control}
            placeholder="123 Main St, City, State, Country"
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

          {selectedCategory && (
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
          )}

          <FormTagMultiSelect
            name="idealFor"
            label="Ideal For"
            control={form.control}
            optionGroups={IDEAL_FOR_OPTION_GROUPS}
            maxSelections={4}
            description="Choose 1 to 4 tags"
            allowDirectTagArrayInput
          />

          <FormInput
            name="tripadvisorUrl"
            label="TripAdvisor URL"
            control={form.control}
            placeholder="https://www.tripadvisor.com/..."
            description="Optional — used to extract the TripAdvisor location ID"
          />

          <SubmitButton
            isLoading={isCreating}
            submitText="Add Location"
            submittingText="Adding Location..."
            disabled={!form.formState.isValid}
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
