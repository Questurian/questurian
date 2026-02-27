import type { UseFormReturn } from "react-hook-form";
import { FormInput, TaxonomyLocationEditor } from "@client/shared/components/forms";
import type { EditLocationFormData } from "../validation/edit-location.schema";

interface TaxonomyFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
}

export function TaxonomyFieldsSection({ form }: TaxonomyFieldsSectionProps) {
  const locationKey = form.watch("locationKey") || "";
  const district = form.watch("district") || "";

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Taxonomy
      </p>

      <TaxonomyLocationEditor
        locationKey={locationKey}
        district={district}
        onLocationKeyChange={(next) =>
          form.setValue("locationKey", next, {
            shouldDirty: true,
            shouldValidate: true,
            shouldTouch: true,
          })
        }
        onDistrictChange={(next) =>
          form.setValue("district", next, {
            shouldDirty: true,
            shouldValidate: true,
            shouldTouch: true,
          })
        }
        locationKeyError={form.formState.errors.locationKey?.message}
      />

      <FormInput
        name="countryCode"
        label="Country Code"
        control={form.control}
        placeholder="PE / CO / BR / AR"
      />
    </div>
  );
}
