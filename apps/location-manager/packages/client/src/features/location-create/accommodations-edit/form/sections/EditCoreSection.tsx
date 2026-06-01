import type { UseFormReturn } from "react-hook-form";
import { FieldLabel, OptionSelect } from "../../../accommodations-create/form/AccommodationsFieldControls";
import { PRICE_OPTIONS } from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import type { SuggestProps } from "./section-types";

interface EditCoreSectionProps {
  form: UseFormReturn<AddAccommodationsFormData>;
  suggestProps: SuggestProps;
  isLoadingTypes: boolean;
  locationTypes: Array<{ value: string; label: string }>;
}

export function EditCoreSection({ form, suggestProps, isLoadingTypes, locationTypes }: EditCoreSectionProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Core</h2>
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <FieldLabel {...suggestProps("type")}>Type</FieldLabel>
          <select
            value={form.watch("type") || ""}
            onChange={(event) =>
              form.setValue("type", event.target.value, {
                shouldDirty: true,
                shouldValidate: true,
                shouldTouch: true,
              })
            }
            disabled={isLoadingTypes}
            className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
          >
            <option value="">{isLoadingTypes ? "Loading types..." : "Select a type"}</option>
            {locationTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.formState.errors.type && (
            <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
          )}
        </div>
        <OptionSelect
          label="Price"
          options={PRICE_OPTIONS}
          value={form.watch("price")}
          onChange={(value) =>
            form.setValue("price", value as AddAccommodationsFormData["price"], { shouldValidate: true })
          }
          error={form.formState.errors.price?.message}
          {...suggestProps("price")}
        />
      </div>
    </section>
  );
}
