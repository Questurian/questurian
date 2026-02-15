import type { UseFormReturn } from "react-hook-form";
import { FormInput, FormTextarea } from "@client/shared/components/forms";
import type { EditLocationFormData } from "../validation/edit-location.schema";

interface ExternalFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
}

export function ExternalFieldsSection({ form }: ExternalFieldsSectionProps) {
  return (
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
    </div>
  );
}
