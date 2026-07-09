import type { ReactNode } from "react";
import { Skeleton, ErrorAlert, SubmitButton } from "@client/shared/components/ui";
import type { LocationCategory } from "@shared/types/location-category";
import type { LocationResponse } from "@client/shared/services/api/types";
import { useLocationDetailForm } from "../hooks/useLocationDetailForm";
import { PendingSuggestionsPanel } from "./PendingSuggestionsPanel";
import { BasicsSection } from "./location-detail/BasicsSection";
import { TaxonomySection } from "./location-detail/TaxonomySection";
import { ContactSection } from "./location-detail/ContactSection";
import { DetailsSection } from "./location-detail/DetailsSection";
import { ExternalLinksSection } from "./location-detail/ExternalLinksSection";
import { MediaSection } from "./location-detail/MediaSection";

interface LocationDetailProps {
  locationId: number;
  category: LocationCategory;
  /** Slot rendered above the card (breadcrumbs in edit, success header in post-create). */
  headerSlot?: ReactNode;
  /** Slot appended after the Save/Cancel footer (e.g. Add Another / Done in post-create). */
  footerSlot?: (ctx: { isDirty: boolean }) => ReactNode;
  /** Slot rendered after pending suggestions and before edit sections. */
  summarySlot?: (ctx: { location: LocationResponse }) => ReactNode;
  /** When true, poll the location every 10s up to 2 min so late Stage-2 suggestions appear live. */
  pollForSuggestions?: boolean;
  /** Called after a successful batch update. Edit mode navigates home; post-create stays. */
  onUpdateSuccess?: () => void;
  /** Empty-state hint shown above the pending-suggestions area when there are none yet. */
  pendingEmptyHint?: ReactNode;
}

export function LocationDetail({
  locationId,
  category,
  headerSlot,
  footerSlot,
  summarySlot,
  pollForSuggestions = false,
  onUpdateSuccess,
  pendingEmptyHint,
}: LocationDetailProps) {
  const {
    form,
    location,
    isLoading,
    fetchError,
    isPending,
    updateError,
    isLoadingTypes,
    locationTypes,
    operationHoursModalOpen,
    setOperationHoursModalOpen,
    handleSubmit,
    cancelChanges,
  } = useLocationDetailForm({
    locationId,
    category,
    pollForSuggestions,
    onUpdateSuccess,
  });

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <ErrorAlert title="Error loading location" message={fetchError.message} />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-muted-foreground">Location not found</p>
        </div>
      </div>
    );
  }

  const isDirty = form.formState.isDirty;
  const hasPending =
    location.pendingSuggestions && Object.keys(location.pendingSuggestions).length > 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      {headerSlot}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 animate-fade-in-up">
        {hasPending ? (
          <div className="mb-4">
            <PendingSuggestionsPanel
              locationId={location.id}
              category={location.category}
              pending={location.pendingSuggestions}
            />
          </div>
        ) : pendingEmptyHint ? (
          <div className="mb-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {pendingEmptyHint}
          </div>
        ) : null}

        {summarySlot ? <div className="mb-4">{summarySlot({ location })}</div> : null}

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <BasicsSection
            form={form}
            location={location}
            locationTypes={locationTypes}
            isLoadingTypes={isLoadingTypes}
          />
          <TaxonomySection form={form} />
          <ContactSection form={form} category={category} />
          <DetailsSection
            form={form}
            category={category}
            location={location}
            operationHoursModalOpen={operationHoursModalOpen}
            setOperationHoursModalOpen={setOperationHoursModalOpen}
          />
          <ExternalLinksSection form={form} location={location} />
          <MediaSection location={location} />

          <div className="space-y-2 pt-2">
            <SubmitButton
              isLoading={isPending}
              submitText="Save Changes"
              submittingText="Saving…"
              disabled={!isDirty}
              className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            />
            <button
              type="button"
              onClick={cancelChanges}
              disabled={!isDirty}
              className="w-full h-10 text-sm font-normal bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel Changes
            </button>
          </div>

          {updateError && <ErrorAlert message={updateError.message} />}

          {footerSlot ? <div className="pt-2 border-t border-border/60">{footerSlot({ isDirty })}</div> : null}
        </form>
      </div>
    </div>
  );
}
