import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { DetailField } from "../list/DetailField";

interface LocationAccommodationsDetailsProps {
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

export function LocationAccommodationsDetails({
  locationDetail,
  onCopyField,
}: LocationAccommodationsDetailsProps) {
  if (locationDetail.category !== "accommodations") {
    return null;
  }

  const details = parseAccommodationsDetails(locationDetail.accommodationsDetails);

  const coreFields: Array<{ label: string; value: string | null }> = [
    { label: "Price", value: stringValue(details.corePrice || locationDetail.priceLevel) },
    { label: "District", value: stringValue(details.coreDistrict || locationDetail.district) },
    { label: "Type", value: stringValue(details.coreType || locationDetail.type) },
  ];

  const stayFields: Array<{ label: string; value: string | null }> = [
    { label: "Perfect For", value: stringArrayValue(details.perfectFor) },
    { label: "Kid Friendly", value: booleanLabel(details.kidFriendly) },
    { label: "AC", value: booleanLabel(details.ac) },
    { label: "WiFi", value: booleanLabel(details.wifi) },
    { label: "Extra Guest Fee", value: booleanLabel(details.extraGuestFee) },
    { label: "Parking", value: stringArrayValue(details.parking) },
    { label: "Breakfast Served", value: booleanLabel(details.breakfastServed) },
  ];

  const experienceFields: Array<{ label: string; value: string | null }> = [
    { label: "Vibe", value: stringArrayValue(details.vibe) },
    { label: "Workspace", value: stringValue(details.workspace) },
    { label: "Restaurant", value: booleanLabel(details.restaurant) },
    { label: "Pool", value: stringArrayValue(details.pool) },
    { label: "Rooftop Lounge", value: booleanLabel(details.rooftopLounge) },
    { label: "Jacuzzi", value: stringArrayValue(details.jacuzzi) },
    { label: "Gym", value: stringValue(details.gym) },
  ];

  const detailFields: Array<{ label: string; value: string | null }> = [
    { label: "Address", value: stringValue(details.address || locationDetail.source.address) },
    { label: "Walkability", value: stringValue(details.walkability) },
    { label: "Check-In Time", value: stringValue(details.checkInTime) },
    { label: "Check-Out Time", value: stringValue(details.checkOutTime) },
    { label: "Phone", value: stringValue(details.phone || locationDetail.contact.phoneNumber) },
    { label: "Website URL", value: stringValue(details.websiteUrl || locationDetail.contact.website) },
    { label: "Booking URL", value: stringValue(details.bookingUrl) },
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

  const hasAnyFields = [
    ...coreFields,
    ...stayFields,
    ...experienceFields,
    ...detailFields,
  ].some((field) => Boolean(field.value));

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
        The Stay
      </div>
      <div className="space-y-2">{renderFields(stayFields)}</div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        The Experience
      </div>
      <div className="space-y-2">{renderFields(experienceFields)}</div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        The Details
      </div>
      <div className="space-y-2">{renderFields(detailFields)}</div>
    </div>
  );
}

