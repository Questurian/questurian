import { useEffect, useState } from "react";
import { CalendarCheck, ExternalLink, Pencil } from "lucide-react";
import { Button, Input, Label } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import type { LocationResponse } from "@client/shared/services/api/types";
import { DetailField } from "../list/DetailField";
import { LocationCompleteness } from "./LocationCompleteness";
import { LocationIdealForEditor } from "./LocationIdealForEditor";
import { LocationMediaGallery } from "./LocationMediaGallery";
import { AttractionToursManager } from "@client/shared/components/tours/AttractionToursManager";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { useToast } from "@client/shared/hooks/useToast";

interface LocationDetailViewProps {
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

interface BookingUrlFieldProps {
  label: string;
  value: string;
  locationDetail: LocationResponse;
}

function bookingUrlLabelFor(category: LocationResponse["category"]): string | null {
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
  const bookingUrlLabel = bookingUrlLabelFor(locationDetail.category);
  const bookingUrl = locationDetail.bookingUrl?.trim();

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

        {bookingUrlLabel && bookingUrl && (
          <BookingUrlField
            label={bookingUrlLabel}
            value={bookingUrl}
            locationDetail={locationDetail}
          />
        )}

        <LocationMediaGallery locationDetail={locationDetail} />
      </div>
    </div>
  );
}

function BookingUrlField({ label, value, locationDetail }: BookingUrlFieldProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const displayUrl = formatBookingUrl(value);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <CalendarCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block min-w-0 text-sm font-medium text-foreground hover:text-primary"
              title={value}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="block truncate">{displayUrl.host}</span>
              {displayUrl.path && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {displayUrl.path}
                </span>
              )}
            </a>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditOpen(true);
            }}
            title={`Edit ${label.toLowerCase()}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            title={`Open ${label.toLowerCase()}`}
          >
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </Button>
        </div>
      </div>

      <BookingUrlEditModal
        label={label}
        locationDetail={locationDetail}
        value={value}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </div>
  );
}

function BookingUrlEditModal({
  label,
  locationDetail,
  value,
  open,
  onOpenChange,
}: {
  label: string;
  locationDetail: LocationResponse;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const { mutate: updateLocation, isPending } = useUpdateLocation();
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setDraft(value);
      setError(null);
    }
  }, [open, value]);

  const trimmedDraft = draft.trim();
  const hasChanged = trimmedDraft !== value;

  function handleSave() {
    if (trimmedDraft) {
      try {
        const parsed = new URL(trimmedDraft);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          setError("Use an HTTP or HTTPS URL.");
          return;
        }
      } catch {
        setError("Enter a valid URL.");
        return;
      }
    }

    updateLocation(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: { bookingUrl: trimmedDraft || null },
      },
      {
        onSuccess: () => {
          showToast(`${label} saved`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          showToast(err.message || `Failed to save ${label.toLowerCase()}`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
          <DialogDescription>
            Update the direct booking or reservation link for this location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="quick-booking-url">{label}</Label>
          <Input
            id="quick-booking-url"
            type="url"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasChanged && !isPending) {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="https://example.com/reservations"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !hasChanged}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBookingUrl(value: string): { host: string; path: string } {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`.replace(/^\/$/, "");

    return {
      host: url.hostname.replace(/^www\./, ""),
      path: path.startsWith("/") ? path.slice(1) : path,
    };
  } catch {
    return {
      host: value,
      path: "",
    };
  }
}
