import type { UseFormReturn } from "react-hook-form";
import { MultiOptionTable, OptionSelect } from "../../../accommodations-create/form/AccommodationsFieldControls";
import {
  BOOLEAN_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  POOL_OPTIONS,
  VIBE_OPTIONS,
  WORKSPACE_OPTIONS,
} from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import type { SuggestProps } from "./section-types";

interface EditExperienceSectionProps {
  form: UseFormReturn<AddAccommodationsFormData>;
  suggestProps: SuggestProps;
  onToggleMulti: (field: "vibe" | "workspace" | "pool" | "jacuzzi", value: string) => void;
}

export function EditExperienceSection({ form, suggestProps, onToggleMulti }: EditExperienceSectionProps) {
  const { watch, setValue, formState } = form;
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">The Experience</h2>
      <MultiOptionTable
        label="Vibe"
        options={VIBE_OPTIONS}
        values={watch("vibe")}
        onToggle={(value) => onToggleMulti("vibe", value)}
        error={formState.errors.vibe?.message}
        {...suggestProps("vibe")}
      />
      <MultiOptionTable
        label="Workspace"
        options={WORKSPACE_OPTIONS}
        values={watch("workspace")}
        onToggle={(value) => onToggleMulti("workspace", value)}
        error={formState.errors.workspace?.message}
        {...suggestProps("workspace")}
      />
      <OptionSelect
        label="Restaurant"
        options={BOOLEAN_OPTIONS}
        value={watch("restaurant")}
        onChange={(value) =>
          setValue("restaurant", value as AddAccommodationsFormData["restaurant"], { shouldValidate: true })
        }
        error={formState.errors.restaurant?.message}
        {...suggestProps("restaurant")}
      />
      <MultiOptionTable
        label="Pool"
        options={POOL_OPTIONS}
        values={watch("pool")}
        onToggle={(value) => onToggleMulti("pool", value)}
        error={formState.errors.pool?.message}
        {...suggestProps("pool")}
      />
      <OptionSelect
        label="Rooftop Lounge"
        options={BOOLEAN_OPTIONS}
        value={watch("rooftopLounge")}
        onChange={(value) =>
          setValue("rooftopLounge", value as AddAccommodationsFormData["rooftopLounge"], { shouldValidate: true })
        }
        error={formState.errors.rooftopLounge?.message}
        {...suggestProps("rooftopLounge")}
      />
      <MultiOptionTable
        label="Jacuzzi"
        options={JACUZZI_OPTIONS}
        values={watch("jacuzzi")}
        onToggle={(value) => onToggleMulti("jacuzzi", value)}
        error={formState.errors.jacuzzi?.message}
        {...suggestProps("jacuzzi")}
      />
      <OptionSelect
        label="Gym"
        options={GYM_OPTIONS}
        value={watch("gym")}
        onChange={(value) =>
          setValue("gym", value as AddAccommodationsFormData["gym"], { shouldValidate: true })
        }
        error={formState.errors.gym?.message}
        {...suggestProps("gym")}
      />
    </section>
  );
}
