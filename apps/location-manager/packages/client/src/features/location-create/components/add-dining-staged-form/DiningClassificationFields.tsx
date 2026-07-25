import { Label } from "@client/components/ui/label";
import { FormTagMultiSelect } from "@client/shared/components/forms";
import { getIdealForOptionGroups } from "../../constants/ai-prompt-template";
import { AiStatusBadge } from "../AiStatusBadge";
import { ProvenanceBadge } from "../ProvenanceBadge";
import type { DiningReviewFieldsProps } from "./add-dining-staged-form.types";

interface DiningClassificationFieldsProps extends Pick<
  DiningReviewFieldsProps,
  "form" | "provenance" | "aiFieldStatus" | "onRetryAiField"
> {
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
}

export function DiningClassificationFields({
  form,
  provenance,
  aiFieldStatus,
  onRetryAiField,
  locationTypes,
  isLoadingTypes,
}: DiningClassificationFieldsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold tracking-tight text-foreground">Classification</h2>
      <div className="space-y-2">
        <Label className="inline-flex items-center gap-2">
          Type
          <ProvenanceBadge provenance={provenance.type} />
          <AiStatusBadge
            fieldKey="type"
            fieldLabel="Type"
            status={aiFieldStatus.type}
            onRetry={onRetryAiField}
          />
        </Label>
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
          <option value="">{isLoadingTypes ? "Loading types..." : "Not set"}</option>
          {locationTypes.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Ideal For status
          </span>
          <AiStatusBadge
            fieldKey="idealFor"
            fieldLabel="Ideal For"
            status={aiFieldStatus.idealFor}
            onRetry={onRetryAiField}
          />
        </div>
        <FormTagMultiSelect
          name="idealFor"
          label="Ideal For"
          control={form.control}
          optionGroups={getIdealForOptionGroups("dining")}
          maxSelections={4}
          description="Choose 1 to 4 tags"
        />
      </div>
    </div>
  );
}
