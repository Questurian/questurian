import type { LocationResponse } from "@client/shared/services/api/types";
import { LocationDetailReviewStack } from "./LocationDetailReviewStack";

interface LocationDetailViewProps {
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

export function LocationDetailView({ locationDetail, isLoading, error, onCopyField }: LocationDetailViewProps) {
  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">Loading details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm text-destructive">
          Error loading details: {error.message}
        </p>
      </div>
    );
  }

  if (!locationDetail) {
    return null;
  }

  return (
    <LocationDetailReviewStack
      locationDetail={locationDetail}
      onCopyField={onCopyField}
    />
  );
}
