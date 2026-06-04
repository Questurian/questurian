import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Clock } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { OperationHoursModal } from "../../../components/OperationHoursModal";
import {
  buildOperationHoursSummary,
  isOperationHoursJson,
} from "../../../components/operation-hours-utils";
import { DAYTIME_RESTAURANT_OPTIONS } from "../../../constants/nightlife-options";
import {
  NIGHTLIFE_COUNTRY_OPTIONS,
  type EditNightlifeFormData,
} from "../../nightlife-edit.types";
import type { BookingSuggestState } from "../../suggestions/useNightlifeEditSuggestions";

interface EditContactSectionProps {
  form: UseFormReturn<EditNightlifeFormData>;
  bookingSuggestState: BookingSuggestState;
  onBookingUrlSuggest: () => void;
}

const SET_OPTIONS = { shouldValidate: true, shouldDirty: true, shouldTouch: true } as const;

export function EditContactSection({
  form,
  bookingSuggestState,
  onBookingUrlSuggest,
}: EditContactSectionProps) {
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  const selectedCountryCode = form.watch("countryCode");
  const hoursValue = form.watch("hours") ?? "";
  const hasStructuredOperationHours = isOperationHoursJson(hoursValue);
  const hasLegacyTextHours = Boolean(hoursValue.trim()) && !hasStructuredOperationHours;

  const countryOptions = useMemo(() => {
    const normalized = selectedCountryCode.trim().toUpperCase();
    if (!normalized || NIGHTLIFE_COUNTRY_OPTIONS.some((option) => option.value === normalized)) {
      return NIGHTLIFE_COUNTRY_OPTIONS;
    }
    return [{ value: normalized, label: `${normalized} (Current)` }, ...NIGHTLIFE_COUNTRY_OPTIONS];
  }, [selectedCountryCode]);

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wide text-foreground">Contact & Access</h2>

      <div className="space-y-2 max-w-xs">
        <Label>Country</Label>
        <select
          value={selectedCountryCode}
          onChange={(event) => form.setValue("countryCode", event.target.value.toUpperCase(), SET_OPTIONS)}
          className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
        >
          {countryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField form={form} field="phone" label="Phone" placeholder="+1 (555) 234-5678" />
        <div className="space-y-2">
          <Label>Hours</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setOperationHoursModalOpen(true)}
            >
              <Clock className="h-4 w-4" />
              {hoursValue ? "Edit schedule" : "Set schedule"}
            </Button>
            {hoursValue && !hasLegacyTextHours && (
              <span className="text-xs text-muted-foreground">
                Schedule configured - open modal to edit
              </span>
            )}
          </div>
          {hasLegacyTextHours && (
            <p className="text-xs text-amber-500">
              Legacy free-text hours detected. Open the schedule modal and save to convert it to the
              restaurant-style format.
            </p>
          )}
          {operationHoursModalOpen && (
            <OperationHoursModal
              open={operationHoursModalOpen}
              onOpenChange={setOperationHoursModalOpen}
              value={hoursValue}
              onSave={(json) => form.setValue("hours", json, SET_OPTIONS)}
            />
          )}
          {hasStructuredOperationHours && (
            <p className="text-xs text-muted-foreground">{buildOperationHoursSummary(hoursValue)}</p>
          )}
        </div>
        <TextField form={form} field="website" label="Website" placeholder="https://example.com/nebula" />
        <BookingUrlField
          form={form}
          bookingSuggestState={bookingSuggestState}
          onBookingUrlSuggest={onBookingUrlSuggest}
        />
      </div>

      <DaytimeRestaurantField form={form} />
    </section>
  );
}

function TextField({
  form,
  field,
  label,
  placeholder,
}: {
  form: UseFormReturn<EditNightlifeFormData>;
  field: "phone" | "website";
  label: string;
  placeholder: string;
}) {
  const error = form.formState.errors[field];
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input placeholder={placeholder} {...form.register(field)} />
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  );
}

function BookingUrlField({
  form,
  bookingSuggestState,
  onBookingUrlSuggest,
}: EditContactSectionProps) {
  return (
    <div className="space-y-2">
      <Label>Reservation URL</Label>
      <Input placeholder="https://example.com/nebula/reserve" {...form.register("bookingUrl")} />
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
        <span className="text-xs text-muted-foreground">Lands as a Pending Suggestion; accept to apply.</span>
      </div>
      {form.formState.errors.bookingUrl && (
        <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
      )}
      {bookingSuggestState.status === "error" && (
        <p className="text-xs text-destructive">{bookingSuggestState.message}</p>
      )}
    </div>
  );
}

function DaytimeRestaurantField({ form }: { form: UseFormReturn<EditNightlifeFormData> }) {
  const value = form.watch("daytimeRestaurant");
  return (
    <div className="space-y-2">
      <Label>Daytime Restaurant Service</Label>
      <select
        value={value}
        onChange={(event) =>
          form.setValue("daytimeRestaurant", event.target.value as EditNightlifeFormData["daytimeRestaurant"], SET_OPTIONS)
        }
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
        {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Option Label</th>
              <th className="text-left px-2 py-1.5 font-medium">What This Means</th>
            </tr>
          </thead>
          <tbody>
            {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
              <tr
                key={option.value}
                className={value === option.value ? "bg-primary/10 border-t border-border" : "border-t border-border"}
              >
                <td className="px-2 py-1.5 font-medium">{option.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form.formState.errors.daytimeRestaurant && (
        <p className="text-xs text-destructive">{form.formState.errors.daytimeRestaurant.message}</p>
      )}
    </div>
  );
}
