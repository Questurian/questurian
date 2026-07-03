import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "@client/components/ui";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";
import type { LocationCategory } from "@shared/types/location-category";
import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import { useLocationDetailForm } from "../../hooks/useLocationDetailForm";
import { DetailSection, DetailRow, ReadOnlyValue } from "../DetailLayout";
import { ControlledInputRow, ControlledSelectRow } from "./ControlledDetailRows";
import { fieldProvenance, formatCoords } from "./locationDetail.utils";

export function BasicsSection({
  form,
  location,
  locationTypes,
  isLoadingTypes,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  location: LocationResponse;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
}) {
  const category = location.category as LocationCategory;
  const typeLabel = category === "dining" ? "Type of Establishment" : "Type";

  return (
    <DetailSection title="Basics">
      <ControlledInputRow
        label="Title"
        name="title"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "title")}
        placeholder="Location title"
      />
      <ControlledInputRow
        label="Name"
        name="name"
        control={form.control}
        placeholder="Location name"
      />
      <DetailRow label="Category">
        <ReadOnlyValue value={location.category} />
      </DetailRow>
      <ControlledSelectRow
        label={typeLabel}
        name="type"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "type")}
        placeholder={isLoadingTypes ? "Loading types..." : "Select a type"}
        disabled={isLoadingTypes}
      >
        {category === "dining"
          ? DINING_ESTABLISHMENT_TYPE_GROUPS.map((group, groupIndex) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {groupIndex < DINING_ESTABLISHMENT_TYPE_GROUPS.length - 1 && <SelectSeparator />}
              </SelectGroup>
            ))
          : locationTypes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
      </ControlledSelectRow>
      <ControlledInputRow
        label="Address"
        name="address"
        control={form.control}
        placeholder="123 Main St, City, Country"
        description="Coordinates are locked and will not be re-geocoded."
      />
      <ControlledInputRow
        label="District"
        name="district"
        control={form.control}
        placeholder="Neighborhood / district"
      />
      <DetailRow label="Coordinates">
        <ReadOnlyValue value={formatCoords(location.coordinates.lat, location.coordinates.lng)} />
      </DetailRow>
    </DetailSection>
  );
}
