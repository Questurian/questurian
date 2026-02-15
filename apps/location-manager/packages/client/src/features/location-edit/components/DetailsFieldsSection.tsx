import { lazy, Suspense } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Clock } from "lucide-react";
import { FormTextarea } from "@client/shared/components/forms";
import { Button } from "@client/components/ui";
import { Field, FieldLabel } from "@client/shared/components/ui";
import type { EditLocationFormData } from "../validation/edit-location.schema";

const OperationHoursModal = lazy(
  () =>
    import("@client/features/location-edit/components/OperationHoursModal").then((m) => ({
      default: m.OperationHoursModal,
    }))
);

interface DetailsFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
  operationHoursModalOpen: boolean;
  setOperationHoursModalOpen: (open: boolean) => void;
}

export function DetailsFieldsSection({
  form,
  operationHoursModalOpen,
  setOperationHoursModalOpen,
}: DetailsFieldsSectionProps) {
  return (
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
  );
}
