import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { FormInput, FormSelect } from "@client/shared/components/forms";
import { Button, SelectItem } from "@client/components/ui";
import { locationsApi } from "@client/shared/services/api";
import { LOCATION_BY_ID_QUERY_KEY } from "@client/shared/services/api/hooks/useLocationById";
import type { EditLocationFormData } from "../validation/edit-location.schema";
import { TIMEZONE_OPTIONS } from "../constants/edit-location.constants";
import type { LocationCategory } from "@shared/types/location-category";

interface ContactFieldsSectionProps {
  form: UseFormReturn<EditLocationFormData>;
  category: LocationCategory;
  /** Required for the bookingUrl AI Suggest button on the edit page.
   *  Omit for create-time renders where no Location exists yet. */
  locationId?: number;
}

function bookingUrlLabelFor(category: LocationCategory): string | null {
  switch (category) {
    case "dining":
    case "nightlife":
      return "Reservation URL";
    case "accommodations":
      return "Booking URL";
    case "attractions":
      return "Tickets URL";
    case "key_locations":
      return null;
  }
}

export function ContactFieldsSection({ form, category, locationId }: ContactFieldsSectionProps) {
  const queryClient = useQueryClient();
  const [suggestState, setSuggestState] = useState<
    { status: "idle" } | { status: "busy" } | { status: "error"; message: string }
  >({ status: "idle" });

  const [phoneNotAvailable, setPhoneNotAvailable] = useState(
    () => !(form.getValues("phoneNumber") ?? "").trim()
  );

  const bookingUrlLabel = bookingUrlLabelFor(category);
  const canSuggest = Boolean(locationId) && bookingUrlLabel !== null;

  async function handleSuggest() {
    if (!locationId) return;
    setSuggestState({ status: "busy" });
    try {
      await locationsApi.proposePendingSuggestion(locationId, "bookingUrl");
      await queryClient.invalidateQueries({
        queryKey: LOCATION_BY_ID_QUERY_KEY(category, locationId),
      });
      setSuggestState({ status: "idle" });
    } catch (err) {
      setSuggestState({
        status: "error",
        message: err instanceof Error ? err.message : "Suggest failed",
      });
    }
  }

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

      <div className="space-y-2">
        <FormInput
          name="phoneNumber"
          label="Phone Number"
          control={form.control}
          placeholder="Phone number (optional)"
          disabled={phoneNotAvailable}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
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
      </div>

      <FormInput
        name="website"
        label="Website"
        control={form.control}
        placeholder="Website URL (optional)"
      />

      {category === "dining" && (
        <FormInput
          name="menuUrl"
          label="Menu URL"
          control={form.control}
          placeholder="Menu URL (optional)"
        />
      )}

      {bookingUrlLabel && (
        <div className="space-y-2">
          <FormInput
            name="bookingUrl"
            label={bookingUrlLabel}
            control={form.control}
            placeholder={`${bookingUrlLabel} (optional)`}
          />
          {canSuggest && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleSuggest()}
                disabled={suggestState.status === "busy"}
              >
                {suggestState.status === "busy" ? "Suggesting…" : "Suggest with AI"}
              </Button>
              {suggestState.status === "error" && (
                <span className="text-xs text-destructive">{suggestState.message}</span>
              )}
              <span className="text-xs text-muted-foreground">
                Lands as a Pending Suggestion — accept to apply.
              </span>
            </div>
          )}
        </div>
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
