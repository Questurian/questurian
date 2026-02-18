import type { LocationResponse } from "@client/shared/services/api/types";
import { DetailField } from "../list/DetailField";
import { parseNightlifeDetails } from "../../utils/nightlife-details";

interface LocationNightlifeDetailsProps {
  locationDetail: LocationResponse;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

function renderValue(value: string | string[] | null): string | null {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : null;
  }
  return value;
}

export function LocationNightlifeDetails({
  locationDetail,
  onCopyField,
}: LocationNightlifeDetailsProps) {
  if (locationDetail.category !== "nightlife") {
    return null;
  }

  const details = parseNightlifeDetails(locationDetail.nightlifeDetails);

  const spaceFields: Array<{ label: string; value: string | string[] | null }> = [
    { label: "Price Tier", value: details.priceTier },
    { label: "Venue Type", value: details.venueType },
    { label: "Venue Size", value: details.venueSize },
    { label: "Layout", value: details.spaceLayout },
    { label: "Vibe", value: details.vibe },
    { label: "Peak Hours", value: details.peakHours },
  ];

  const sceneFields: Array<{ label: string; value: string | string[] | null }> = [
    { label: "Tourist Presence", value: details.touristPresence },
    { label: "Music Format", value: details.musicFormat },
    { label: "Dress Code", value: details.dressCode },
    { label: "Energy Level", value: details.energyLevel },
    { label: "VIP/Bottle Service", value: details.vipAndBottleService },
    { label: "Crowd Profile", value: details.crowdProfile },
  ];

  const operationsFields: Array<{ label: string; value: string | string[] | null }> = [
    { label: "Nightlife Hours", value: details.hours },
    { label: "Nightlife Website", value: details.website },
    { label: "Reserve URL", value: details.reserveUrl },
    {
      label: "Daytime Restaurant",
      value: details.daytimeRestaurant === "1"
        ? "Yes"
        : details.daytimeRestaurant === "0"
          ? "No"
          : details.daytimeRestaurant,
    },
  ];

  const renderField = (label: string, rawValue: string | string[] | null) => {
    const value = renderValue(rawValue);
    if (!value) return null;

    return (
      <DetailField
        key={label}
        label={label}
        value={value}
        onClick={(e) => onCopyField(value, e)}
        title={`Click to copy ${label.toLowerCase()}`}
      />
    );
  };

  const hasAnyNightlifeFields = Boolean(
    details.hasDetails &&
      [...spaceFields, ...sceneFields, ...operationsFields].some((field) => renderValue(field.value))
  );

  if (!hasAnyNightlifeFields) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        The Space
      </div>
      <div className="space-y-2">
        {spaceFields.map((field) => renderField(field.label, field.value))}
      </div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        The Scene
      </div>
      <div className="space-y-2">
        {sceneFields.map((field) => renderField(field.label, field.value))}
      </div>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Operations
      </div>
      <div className="space-y-2">
        {operationsFields.map((field) => renderField(field.label, field.value))}
      </div>
    </div>
  );
}
