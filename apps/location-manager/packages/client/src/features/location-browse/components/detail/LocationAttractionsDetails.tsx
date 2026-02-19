import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";
import { DetailField } from "../list/DetailField";

interface LocationAttractionsDetailsProps {
  locationDetail: LocationResponse;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

function booleanLabel(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

function stringValue(value: string | null): string | null {
  if (!value) return null;
  return value;
}

function stringArrayValue(value: string[]): string | null {
  if (!value || value.length === 0) return null;
  return value.join(", ");
}

function formatHours(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value.length > 0 ? JSON.stringify(value) : null;

  const record = value as Record<string, unknown>;
  const hoursArray = record.hours;
  if (Array.isArray(hoursArray)) {
    const rows = hoursArray
      .filter((row): row is { day?: unknown; hours?: unknown } => typeof row === "object" && row !== null)
      .map((row) => {
        const day = typeof row.day === "string" ? row.day : null;
        const hours = typeof row.hours === "string" ? row.hours : null;
        if (!day || !hours) return null;
        return `${day}: ${hours}`;
      })
      .filter((row): row is string => Boolean(row));

    if (rows.length > 0) {
      return rows.join("; ");
    }
  }

  const rows = Object.entries(record)
    .filter(([, entry]) => typeof entry === "string" && entry.trim().length > 0)
    .map(([key, entry]) => `${key}: ${entry as string}`);

  if (rows.length > 0) {
    return rows.join("; ");
  }

  return null;
}

export function LocationAttractionsDetails({
  locationDetail,
  onCopyField,
}: LocationAttractionsDetailsProps) {
  if (locationDetail.category !== "attractions") {
    return null;
  }

  const details = parseAttractionsDetails(locationDetail.attractionsDetails);

  const coreFields: Array<{ label: string; value: string | null }> = [
    { label: "Attraction Type", value: stringValue(details.attractionType || locationDetail.type) },
    { label: "Pricing", value: stringValue(details.pricing || locationDetail.priceLevel) },
    { label: "Location Key", value: stringValue(details.locationKey || locationDetail.locationKey) },
  ];

  const visitFields: Array<{ label: string; value: string | null }> = [
    { label: "Booking Required", value: booleanLabel(details.bookingRequired) },
    {
      label: "Ideal For",
      value: stringArrayValue(details.idealFor.length > 0 ? details.idealFor : (locationDetail.idealFor || [])),
    },
    {
      label: "Visit Hours",
      value: formatHours(details.visitHours || locationDetail.operationHours),
    },
  ];

  const contactFields: Array<{ label: string; value: string | null }> = [
    { label: "Website", value: stringValue(details.website || locationDetail.contact.website) },
    { label: "Phone", value: stringValue(details.phone || locationDetail.contact.phoneNumber) },
    { label: "Google Maps URL", value: stringValue(details.googleMapsUrl || locationDetail.contact.url) },
  ];

  const renderFields = (fields: Array<{ label: string; value: string | null }>) =>
    fields.map((field) => {
      if (!field.value) return null;
      return (
        <DetailField
          key={field.label}
          label={field.label}
          value={field.value}
          onClick={(e) => onCopyField(field.value!, e)}
          title={`Click to copy ${field.label.toLowerCase()}`}
        />
      );
    });

  const hasAnyFields = [...coreFields, ...visitFields, ...contactFields].some((field) => Boolean(field.value));

  if (!details.hasDetails && !hasAnyFields) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Core
      </div>
      <div className="space-y-2">{renderFields(coreFields)}</div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Visit
      </div>
      <div className="space-y-2">{renderFields(visitFields)}</div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Contact
      </div>
      <div className="space-y-2">{renderFields(contactFields)}</div>
    </div>
  );
}
