import type { UseFormReturn } from "react-hook-form";
import { Button } from "@client/components/ui/button";
import { ErrorAlert } from "@client/shared/components/ui";
import { PhotoImportPanel } from "@client/shared/components/location-media/PhotoImportPanel";
import { PendingSuggestionsPanel } from "@client/features/location-edit/components/PendingSuggestionsPanel";
import type { LocationResponse } from "@client/shared/services/api/types";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type { MultiField } from "../../accommodations-create/accommodations-create.types";
import { EditLookupSection } from "./sections/EditLookupSection";
import { EditCoreSection } from "./sections/EditCoreSection";
import { EditStaySection } from "./sections/EditStaySection";
import { EditExperienceSection } from "./sections/EditExperienceSection";
import { EditDetailsSection } from "./sections/EditDetailsSection";
import type { SuggestProps } from "./sections/section-types";

type BookingSuggestState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

interface AccommodationsEditFormProps {
  form: UseFormReturn<AddAccommodationsFormData>;
  location: LocationResponse;
  locationId: number | null;
  suggestProps: SuggestProps;
  onToggleMulti: (field: MultiField, value: string) => void;
  isLoadingTypes: boolean;
  locationTypes: Array<{ value: string; label: string }>;
  isPrefillingGoogle: boolean;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  onGooglePrefill: () => void;
  bookingSuggestState: BookingSuggestState;
  onBookingUrlSuggest: () => void;
  isPending: boolean;
  needsTitleBackfill: boolean;
  updateError: Error | null;
  onSubmit: (data: AddAccommodationsFormData) => void;
  onCancel: () => void;
}

export function AccommodationsEditForm({
  form,
  location,
  locationId,
  suggestProps,
  onToggleMulti,
  isLoadingTypes,
  locationTypes,
  isPrefillingGoogle,
  prefillMessage,
  prefillError,
  prefillIsStale,
  onGooglePrefill,
  bookingSuggestState,
  onBookingUrlSuggest,
  isPending,
  needsTitleBackfill,
  updateError,
  onSubmit,
  onCancel,
}: AccommodationsEditFormProps) {
  return (
    <>
      <div className="mb-6">
        <PhotoImportPanel
          locationId={location.id}
          category="accommodations"
          placeId={location.placeId ?? null}
        />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {locationId && (
          <PendingSuggestionsPanel
            locationId={locationId}
            category="accommodations"
            pending={location.pendingSuggestions}
          />
        )}

        <EditLookupSection
          form={form}
          isPrefillingGoogle={isPrefillingGoogle}
          isPending={isPending}
          prefillMessage={prefillMessage}
          prefillError={prefillError}
          prefillIsStale={prefillIsStale}
          onGooglePrefill={onGooglePrefill}
        />

        <EditCoreSection
          form={form}
          suggestProps={suggestProps}
          isLoadingTypes={isLoadingTypes}
          locationTypes={locationTypes}
        />

        <EditStaySection form={form} suggestProps={suggestProps} onToggleMulti={onToggleMulti} />

        <EditExperienceSection form={form} suggestProps={suggestProps} onToggleMulti={onToggleMulti} />

        <EditDetailsSection
          form={form}
          suggestProps={suggestProps}
          bookingSuggestState={bookingSuggestState}
          onBookingUrlSuggest={onBookingUrlSuggest}
        />

        <div className="space-y-2 mt-6">
          <Button
            type="submit"
            disabled={isPending || !form.formState.isValid || (!form.formState.isDirty && !needsTitleBackfill)}
            className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isPending ? "Updating..." : "Update Accommodations"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="w-full h-10">
            Cancel
          </Button>
        </div>

        {updateError && <ErrorAlert message={updateError.message} />}
      </form>
    </>
  );
}
