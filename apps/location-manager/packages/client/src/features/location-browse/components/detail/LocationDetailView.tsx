import type { LocationResponse } from "@client/shared/services/api/types";
import { DetailField } from "../list/DetailField";
import { LocationCompleteness } from "./LocationCompleteness";
import { LocationIdealForEditor } from "./LocationIdealForEditor";
import { LocationMediaGallery } from "./LocationMediaGallery";
import { AttractionToursManager } from "@client/shared/components/tours/AttractionToursManager";

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

  const sourceAddress = locationDetail.source?.address?.trim();
  const contactAddress = locationDetail.contact?.contactAddress?.trim();
  const showSourceAddress = Boolean(sourceAddress);
  const showContactAddress = Boolean(contactAddress) && contactAddress !== sourceAddress;
  const contactAddressLabel = showSourceAddress ? "Contact Address" : "Address";

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="space-y-3">
        <LocationCompleteness locationDetail={locationDetail} />

        <LocationIdealForEditor locationDetail={locationDetail} />

        {locationDetail.category === "attractions" && (
          <AttractionToursManager locationDetail={locationDetail} />
        )}

        {/* Title field - only show if different from source name */}
        {locationDetail.title && locationDetail.title !== locationDetail.source?.name && (
          <DetailField
            label="Title"
            value={locationDetail.title}
          />
        )}

        {showContactAddress && (
          <DetailField
            label={contactAddressLabel}
            value={contactAddress}
            onClick={(e) => onCopyField(contactAddress!, e)}
            title="Click to copy contact address"
          />
        )}

        <LocationMediaGallery locationDetail={locationDetail} />
      </div>
    </div>
  );
}
