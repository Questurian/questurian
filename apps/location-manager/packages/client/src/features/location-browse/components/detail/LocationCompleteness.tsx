import { useMemo, useState } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

interface LocationCompletenessProps {
  locationDetail: LocationResponse;
}

export function LocationCompleteness({ locationDetail }: LocationCompletenessProps) {
  const requiredFields = useMemo(() => {
    const contact = locationDetail.contact || {};
    const source = locationDetail.source || {};
    const hasOperationHours = Boolean(
      locationDetail.operationHours &&
        Object.keys(locationDetail.operationHours).length > 0
    );

    const hasMedia =
      (locationDetail.uploads && locationDetail.uploads.length > 0) ||
      (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0);
    const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);
    const hasCuisines = Boolean(
      Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
    );

    return [
      { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "type", label: "Type", present: Boolean(locationDetail.type?.trim()) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "ianaTimeId",
        label: "Time Zone (IANA)",
        present: Boolean(locationDetail.ianaTimeId?.trim()),
      },
      { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
      { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim()) },
      { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
      { key: "contactAddress", label: "Contact Address", present: Boolean(contact.contactAddress?.trim()) },
      { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
      {
        key: "neighborhoodDescription",
        label: "Neighborhood",
        present: Boolean(locationDetail.neighborhoodDescription?.trim()),
      },
      { key: "idealFor", label: "Ideal For", present: hasIdealFor },
      { key: "cuisines", label: "Cuisines", present: hasCuisines },
      { key: "priceLevel", label: "Price Level", present: Boolean(locationDetail.priceLevel?.trim()) },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }, [locationDetail]);

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;

  const [completenessExpanded, setCompletenessExpanded] = useState<boolean | undefined>(undefined);
  const isCompletenessExpanded = completenessExpanded ?? !isComplete;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
              isComplete
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isComplete ? "Complete" : "Missing data"}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {isComplete
              ? "All required fields present"
              : `${missingFields.length} required field${
                  missingFields.length === 1 ? "" : "s"
                } missing`}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => setCompletenessExpanded(!isCompletenessExpanded)}
          aria-expanded={isCompletenessExpanded}
        >
          {isCompletenessExpanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
              Expand
            </>
          )}
        </Button>
      </div>
      {isCompletenessExpanded && (
        <>
          {!isComplete && (
            <div className="flex flex-wrap gap-1">
              {missingFields.map((field) => (
                <span
                  key={field.key}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700"
                >
                  {field.label}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {requiredFields.map((field) => (
              <div
                key={field.key}
                className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                  field.present
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                <span>{field.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
