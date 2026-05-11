import type { UseFormReturn } from "react-hook-form";
import { FormInput, FormSelect } from "@client/shared/components/forms";
import { SelectItem } from "@client/components/ui";
import type { EditLocationFormData } from "../validation/edit-location.schema";
import { TIMEZONE_OPTIONS } from "../constants/edit-location.constants";
import type { LocationCategory } from "@shared/types/location-category";

interface ContactFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
  category: LocationCategory;
}

export function ContactFieldsSection({ form, category }: ContactFieldsSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contact
      </p>

      <FormSelect
        name="ianaTimeId"
        label="Time Zone (IANA)"
        control={form.control}
        placeholder="Select a time zone"
      >
        {TIMEZONE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </FormSelect>

      <FormInput
        name="phoneNumber"
        label="Phone Number"
        control={form.control}
        placeholder="Phone number (optional)"
      />

      <FormInput
        name="website"
        label="Website"
        control={form.control}
        placeholder="Website URL (optional)"
      />

      {category === "dining" && (
        <>
          <FormInput
            name="menuUrl"
            label="Menu URL"
            control={form.control}
            placeholder="Menu URL (optional)"
          />

          <FormInput
            name="reservationUrl"
            label="Reservation URL"
            control={form.control}
            placeholder="Reservation URL (optional)"
          />
        </>
      )}

      <FormInput
        name="email"
        label="Email"
        control={form.control}
        placeholder="Email address (optional)"
      />
    </div>
  );
}
