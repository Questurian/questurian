import type { UseFormReturn } from "react-hook-form";
import { MultiOptionTable, OptionSelect } from "../../../accommodations-create/form/AccommodationsFieldControls";
import { BOOLEAN_OPTIONS, PARKING_OPTIONS, PERFECT_FOR_OPTIONS } from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import type { SuggestProps } from "./section-types";

interface EditStaySectionProps {
  form: UseFormReturn<AddAccommodationsFormData>;
  suggestProps: SuggestProps;
  onToggleMulti: (field: "perfectFor" | "parking", value: string) => void;
}

export function EditStaySection({ form, suggestProps, onToggleMulti }: EditStaySectionProps) {
  const { watch, setValue, formState } = form;
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">The Stay</h2>
      <MultiOptionTable
        label="Perfect For"
        options={PERFECT_FOR_OPTIONS}
        values={watch("perfectFor")}
        onToggle={(value) => onToggleMulti("perfectFor", value)}
        error={formState.errors.perfectFor?.message}
        {...suggestProps("perfectFor")}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OptionSelect
          label="Kid Friendly"
          options={BOOLEAN_OPTIONS}
          value={watch("kidFriendly")}
          onChange={(value) =>
            setValue("kidFriendly", value as AddAccommodationsFormData["kidFriendly"], { shouldValidate: true })
          }
          error={formState.errors.kidFriendly?.message}
          {...suggestProps("kidFriendly")}
        />
        <OptionSelect
          label="AC"
          options={BOOLEAN_OPTIONS}
          value={watch("ac")}
          onChange={(value) =>
            setValue("ac", value as AddAccommodationsFormData["ac"], { shouldValidate: true })
          }
          error={formState.errors.ac?.message}
          {...suggestProps("ac")}
        />
        <OptionSelect
          label="WiFi"
          options={BOOLEAN_OPTIONS}
          value={watch("wifi")}
          onChange={(value) =>
            setValue("wifi", value as AddAccommodationsFormData["wifi"], { shouldValidate: true })
          }
          error={formState.errors.wifi?.message}
          {...suggestProps("wifi")}
        />
        <OptionSelect
          label="Extra Guest Fee"
          options={BOOLEAN_OPTIONS}
          value={watch("extraGuestFee")}
          onChange={(value) =>
            setValue("extraGuestFee", value as AddAccommodationsFormData["extraGuestFee"], { shouldValidate: true })
          }
          error={formState.errors.extraGuestFee?.message}
          {...suggestProps("extraGuestFee")}
        />
      </div>
      <MultiOptionTable
        label="Parking"
        options={PARKING_OPTIONS}
        values={watch("parking")}
        onToggle={(value) => onToggleMulti("parking", value)}
        error={formState.errors.parking?.message}
        {...suggestProps("parking")}
      />
      <OptionSelect
        label="Breakfast Served"
        options={BOOLEAN_OPTIONS}
        value={watch("breakfastServed")}
        onChange={(value) =>
          setValue("breakfastServed", value as AddAccommodationsFormData["breakfastServed"], { shouldValidate: true })
        }
        error={formState.errors.breakfastServed?.message}
        {...suggestProps("breakfastServed")}
      />
    </section>
  );
}
