import type { LocationResponse } from "@client/shared/services/api/types";
import { DetailField } from "../list/DetailField";

interface LocationKeyLocationsDetailsProps {
  locationDetail: LocationResponse;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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

  return null;
}

export function LocationKeyLocationsDetails({
  locationDetail,
  onCopyField,
}: LocationKeyLocationsDetailsProps) {
  if (locationDetail.category !== "key_locations") {
    return null;
  }

  const details = asRecord(locationDetail.keyLocationsDetails);
  if (!details) {
    return null;
  }

  const typeValue = asString(details.location_type) || asString(locationDetail.type);
  const statusValue = asString(details.status);
  const districtValue = asString(details.neighborhood) || asString(locationDetail.district);
  const websiteValue = asString(details.website) || asString(locationDetail.contact.website);
  const phoneValue = asString(details.phone) || asString(locationDetail.contact.phoneNumber);
  const imagesValue = asStringArray(details.images);
  const hoursValue = formatHours(details.hours || locationDetail.operationHours);

  const profileFields: Array<{ label: string; value: string | null }> = [
    { label: "Type", value: typeValue },
    { label: "Status", value: statusValue },
    { label: "District", value: districtValue },
    { label: "Hours", value: hoursValue },
    { label: "Images", value: imagesValue.length > 0 ? imagesValue.join(", ") : null },
    { label: "Website", value: websiteValue },
    { label: "Phone", value: phoneValue },
  ];

  const renderFields = (
    fields: Array<{ label: string; value: string | null }>,
    options?: { mono?: boolean }
  ) =>
    fields.map((field) => {
      if (!field.value) return null;
      return (
        <DetailField
          key={field.label}
          label={field.label}
          value={field.value}
          valueClassName={options?.mono ? "text-xs text-foreground font-mono whitespace-pre-wrap break-all" : undefined}
          onClick={(e) => onCopyField(field.value!, e)}
          title={`Click to copy ${field.label.toLowerCase()}`}
        />
      );
    });

  const hasAnyFields = profileFields.some((field) => Boolean(field.value));
  if (!hasAnyFields) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Profile
      </div>
      <div className="space-y-2">{renderFields(profileFields)}</div>
    </div>
  );
}
