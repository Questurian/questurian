import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormInput, FormTextarea } from "@client/shared/components/forms";
import {
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui";
import { X } from "lucide-react";
import {
  CUISINE_OPTION_GROUPS,
  CUISINE_OPTIONS,
  parseCuisineInput,
  serializeCuisineInput,
} from "@client/shared/constants/cuisine-options";
import type { EditLocationFormData } from "../validation/edit-location.schema";

interface ExternalFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
}

export function ExternalFieldsSection({ form }: ExternalFieldsSectionProps) {
  const cuisineInput = form.watch("tripadvisorCuisines") || "";
  const selectedCuisines = useMemo(
    () => parseCuisineInput(cuisineInput),
    [cuisineInput]
  );
  const availableCuisineOptions = useMemo(
    () => CUISINE_OPTIONS.filter((option) => !selectedCuisines.includes(option)),
    [selectedCuisines]
  );
  const availableCuisineGroups = useMemo(
    () =>
      CUISINE_OPTION_GROUPS.map((group) => ({
        ...group,
        options: group.options.filter((option) => !selectedCuisines.includes(option)),
      })).filter((group) => group.options.length > 0),
    [selectedCuisines]
  );

  const updateCuisines = (nextValues: string[]) => {
    form.setValue("tripadvisorCuisines", serializeCuisineInput(nextValues), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

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

      <div className="space-y-2">
        <p className="text-sm font-medium leading-none">TripAdvisor Cuisines</p>
        <Select
          key={`edit-cuisines-${selectedCuisines.join("|") || "empty"}`}
          value={undefined}
          onValueChange={(selectedCuisine) =>
            updateCuisines([...selectedCuisines, selectedCuisine])
          }
          disabled={availableCuisineOptions.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose cuisines" />
          </SelectTrigger>
          <SelectContent>
            {availableCuisineGroups.map((group, groupIndex) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
                {groupIndex < availableCuisineGroups.length - 1 && <SelectSeparator />}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {selectedCuisines.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {selectedCuisines.map((cuisine) => (
                <span
                  key={cuisine}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                >
                  {cuisine}
                  <button
                    type="button"
                    className="rounded-sm text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      updateCuisines(selectedCuisines.filter((item) => item !== cuisine))
                    }
                    aria-label={`Remove ${cuisine}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => updateCuisines([])}
            >
              Clear cuisines
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Safety override. Leave blank to keep current value.
        </p>
      </div>
    </div>
  );
}
