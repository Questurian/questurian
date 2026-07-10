import { useState } from "react";
import { SelectItem } from "@client/components/ui";
import type { LocationCategory } from "@shared/types/location-category";
import { TIMEZONE_OPTIONS } from "../../constants/edit-location.constants";
import { useLocationDetailForm } from "../../hooks/useLocationDetailForm";
import { DetailSection } from "../DetailLayout";
import { ControlledInputRow, ControlledSelectRow } from "./ControlledDetailRows";
import { bookingUrlLabelFor } from "./locationDetail.utils";

export function ContactSection({
  form,
  category,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  category: LocationCategory;
}) {
  const [phoneNotAvailable, setPhoneNotAvailable] = useState(
    () => !(form.getValues("phoneNumber") ?? "").trim()
  );

  return (
    <DetailSection title="Contact">
      <ControlledSelectRow
        label="Time zone (IANA)"
        name="ianaTimeId"
        control={form.control}
        placeholder="Select a time zone"
      >
        {TIMEZONE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </ControlledSelectRow>
      <ControlledInputRow
        label="Phone"
        name="phoneNumber"
        control={form.control}
        placeholder="Phone number"
        disabled={phoneNotAvailable}
        footer={
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={phoneNotAvailable}
              onChange={(event) => {
                const checked = event.target.checked;
                setPhoneNotAvailable(checked);
                if (checked) {
                  form.setValue("phoneNumber", "", { shouldDirty: true, shouldValidate: true });
                }
              }}
            />
            Phone not available
          </label>
        }
      />
      <ControlledInputRow
        label="Website"
        name="website"
        control={form.control}
        placeholder="https://…"
      />
      <ControlledInputRow
        label="Email"
        name="email"
        control={form.control}
        placeholder="contact@…"
      />
      {category === "dining" ? (
        <ControlledInputRow
          label="Menu URL"
          name="menuUrl"
          control={form.control}
          placeholder="https://…"
        />
      ) : null}
      {bookingUrlLabelFor(category) ? (
        <ControlledInputRow
          label={bookingUrlLabelFor(category)!}
          name="bookingUrl"
          control={form.control}
          placeholder="https://…"
        />
      ) : null}
    </DetailSection>
  );
}
