import type { UseFormReturn } from "react-hook-form";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { FieldLabel, OptionSelect } from "../../../accommodations-create/form/AccommodationsFieldControls";
import { WALKABILITY_OPTIONS } from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import type { SuggestProps } from "./section-types";

type BookingSuggestState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

interface EditDetailsSectionProps {
  form: UseFormReturn<AddAccommodationsFormData>;
  suggestProps: SuggestProps;
  bookingSuggestState: BookingSuggestState;
  onBookingUrlSuggest: () => void;
}

export function EditDetailsSection({
  form,
  suggestProps,
  bookingSuggestState,
  onBookingUrlSuggest,
}: EditDetailsSectionProps) {
  const { register, watch, setValue, formState } = form;
  const { errors } = formState;

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">The Details</h2>
      <OptionSelect
        label="Walkability"
        options={WALKABILITY_OPTIONS}
        value={watch("walkability")}
        onChange={(value) =>
          setValue("walkability", value as AddAccommodationsFormData["walkability"], { shouldValidate: true })
        }
        error={errors.walkability?.message}
        {...suggestProps("walkability")}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel {...suggestProps("checkInTime")}>Check-In Time</FieldLabel>
          <Input type="time" {...register("checkInTime")} />
          {errors.checkInTime && <p className="text-xs text-destructive">{errors.checkInTime.message}</p>}
        </div>
        <div className="space-y-2">
          <FieldLabel {...suggestProps("checkOutTime")}>Check-Out Time</FieldLabel>
          <Input type="time" {...register("checkOutTime")} />
          {errors.checkOutTime && <p className="text-xs text-destructive">{errors.checkOutTime.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            placeholder="+1 (555) 700-1200"
            disabled={watch("phoneNotAvailable")}
            {...register("phone")}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={watch("phoneNotAvailable")}
              onChange={(event) => {
                const checked = event.target.checked;
                setValue("phoneNotAvailable", checked, { shouldDirty: true, shouldValidate: true });
                if (checked) {
                  setValue("phone", "", { shouldDirty: true, shouldValidate: true });
                }
              }}
            />
            Phone not available
          </label>
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Website URL</Label>
          <Input placeholder="https://example.com/hotel" {...register("websiteUrl")} />
          {errors.websiteUrl && <p className="text-xs text-destructive">{errors.websiteUrl.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Booking URL</Label>
          <Input placeholder="https://example.com/hotel/book" {...register("bookingUrl")} />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onBookingUrlSuggest}
              disabled={bookingSuggestState.status === "busy"}
            >
              {bookingSuggestState.status === "busy" ? "Suggesting..." : "Suggest with AI"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Lands as a Pending Suggestion; accept to apply.
            </span>
          </div>
          {errors.bookingUrl && <p className="text-xs text-destructive">{errors.bookingUrl.message}</p>}
          {bookingSuggestState.status === "error" && (
            <p className="text-xs text-destructive">{bookingSuggestState.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Google Maps URL</Label>
          <Input placeholder="https://maps.google.com/..." {...register("googleMapsUrl")} />
          {errors.googleMapsUrl && <p className="text-xs text-destructive">{errors.googleMapsUrl.message}</p>}
        </div>
      </div>
    </section>
  );
}
