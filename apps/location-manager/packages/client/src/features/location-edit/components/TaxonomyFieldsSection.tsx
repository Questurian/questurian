import type { UseFormReturn } from "react-hook-form";
import { FormInput } from "@client/shared/components/forms";
import type { EditLocationFormData } from "../validation/edit-location.schema";

interface TaxonomyFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
}

export function TaxonomyFieldsSection({ form }: TaxonomyFieldsSectionProps) {
  return (
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
  );
}
