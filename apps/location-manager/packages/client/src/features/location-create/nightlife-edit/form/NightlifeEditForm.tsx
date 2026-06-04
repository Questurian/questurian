import { Link } from "react-router-dom";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@client/components/ui/button";
import { PendingSuggestionsPanel } from "@client/features/location-edit/components/PendingSuggestionsPanel";
import type { LocationResponse } from "@client/shared/services/api/types";
import type {
  EditNightlifeFormData,
  NightlifeEditMultiField,
} from "../nightlife-edit.types";
import type { BookingSuggestState } from "../suggestions/useNightlifeEditSuggestions";
import { EditLookupSection } from "./sections/EditLookupSection";
import { EditEntitiesSection } from "./sections/EditEntitiesSection";
import { EditDetailsSections } from "./sections/EditDetailsSections";
import { EditContactSection } from "./sections/EditContactSection";

interface NightlifeEditFormProps {
  form: UseFormReturn<EditNightlifeFormData>;
  location: LocationResponse;
  locationId: number;
  onToggleMulti: (field: NightlifeEditMultiField, value: string) => void;
  isPrefillingGoogle: boolean;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  onGooglePrefill: () => void;
  bookingSuggestState: BookingSuggestState;
  onBookingUrlSuggest: () => void;
  isPending: boolean;
  updateError: Error | null;
  onSubmit: (data: EditNightlifeFormData) => void;
}

export function NightlifeEditForm({
  form,
  location,
  locationId,
  onToggleMulti,
  isPrefillingGoogle,
  prefillMessage,
  prefillError,
  prefillIsStale,
  onGooglePrefill,
  bookingSuggestState,
  onBookingUrlSuggest,
  isPending,
  updateError,
  onSubmit,
}: NightlifeEditFormProps) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <PendingSuggestionsPanel
        locationId={locationId}
        category="nightlife"
        pending={location.pendingSuggestions}
      />

      <EditLookupSection
        form={form}
        isPrefillingGoogle={isPrefillingGoogle}
        isPending={isPending}
        prefillMessage={prefillMessage}
        prefillError={prefillError}
        prefillIsStale={prefillIsStale}
        onGooglePrefill={onGooglePrefill}
      />

      <EditEntitiesSection form={form} />
      <EditDetailsSections form={form} onToggleMulti={onToggleMulti} />
      <EditContactSection
        form={form}
        bookingSuggestState={bookingSuggestState}
        onBookingUrlSuggest={onBookingUrlSuggest}
      />

      {updateError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error: {updateError.message}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" asChild>
          <Link to="/">Back</Link>
        </Button>
        <Button type="submit" disabled={!form.formState.isDirty || !form.formState.isValid || isPending}>
          {isPending ? "Saving..." : "Save Nightlife Changes"}
        </Button>
      </div>
    </form>
  );
}
