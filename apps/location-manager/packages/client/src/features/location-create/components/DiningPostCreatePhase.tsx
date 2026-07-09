import { Check } from "lucide-react";
import { LocationCompleteness } from "@client/features/location-browse/components/detail/LocationCompleteness";
import { LocationDetail } from "@client/features/location-edit/components/LocationDetail";
import { LocationMediaGallery } from "@client/shared/components/location-media/LocationMediaGallery";
import { DiningHomepageCardPreview } from "./DiningHomepageCardPreview";

interface DiningPostCreatePhaseProps {
  locationId: number;
  onAddAnother: () => void;
  onDone: () => void;
}

export function DiningPostCreatePhase({
  locationId,
  onAddAnother,
  onDone,
}: DiningPostCreatePhaseProps) {
  return (
    <LocationDetail
      locationId={locationId}
      category="dining"
      pollForSuggestions
      pendingEmptyHint="AI suggestions will appear here as the grounded research completes."
      summarySlot={({ location }) => (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Homepage card preview
            </p>
            <DiningHomepageCardPreview location={location} />
          </div>

          <div className="space-y-3">
            <LocationCompleteness locationDetail={location} />
            <LocationMediaGallery locationDetail={location} />
          </div>
        </div>
      )}
      headerSlot={
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
              Location Added
            </h1>
            <p className="text-xs text-muted-foreground">
              Preview the homepage card, then fix missing fields before moving on.
            </p>
          </div>
        </div>
      }
      footerSlot={({ isDirty }) => (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onAddAnother}
            disabled={isDirty}
            title={isDirty ? "Save or cancel your changes first." : undefined}
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-normal disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Another Location
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={isDirty}
            title={isDirty ? "Save or cancel your changes first." : undefined}
            className="w-full h-10 bg-muted text-muted-foreground hover:bg-muted/90 rounded-md text-sm font-normal disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      )}
    />
  );
}
