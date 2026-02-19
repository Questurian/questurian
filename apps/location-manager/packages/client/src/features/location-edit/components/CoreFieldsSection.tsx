import type { UseFormReturn } from "react-hook-form";
import { FormInput, FormSelect, FormTagMultiSelect } from "@client/shared/components/forms";
import { SelectItem } from "@client/components/ui";
import type { EditLocationFormData } from "../validation/edit-location.schema";
import type { LocationCategory } from "@shared/types/location-category";
import { getIdealForGroups } from "@shared/types/location-ideal-for";

interface CoreFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  category: LocationCategory;
}

export function CoreFieldsSection({ form, locationTypes, isLoadingTypes, category }: CoreFieldsSectionProps) {
  const idealForOptionGroups = getIdealForGroups(category).map((group) => ({
    label: group.label,
    options: group.tags.map((tag) => ({ value: tag, label: tag })),
  }));

  return (
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

      <FormSelect
        name="priceLevel"
        label="Price Level"
        control={form.control}
        placeholder="Select price level"
      >
        <SelectItem value="free">free</SelectItem>
        <SelectItem value="$">$</SelectItem>
        <SelectItem value="$$">$$</SelectItem>
        <SelectItem value="$$$">$$$</SelectItem>
        <SelectItem value="$$$$">$$$$</SelectItem>
      </FormSelect>

      <FormTagMultiSelect
        name="idealFor"
        label="Ideal For"
        control={form.control}
        optionGroups={idealForOptionGroups}
        maxSelections={4}
        description="Choose 1 to 4 tags"
        allowDirectTagArrayInput
      />
    </div>
  );
}
