import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import { useLocationDetailForm } from "../../hooks/useLocationDetailForm";
import { DetailSection, DetailRow, ReadOnlyValue, LinkValue } from "../DetailLayout";
import { ControlledInputRow, ControlledTextareaRow } from "./ControlledDetailRows";
import { fieldProvenance } from "./locationDetail.utils";

export function ExternalLinksSection({
  form,
  location,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  location: LocationResponse;
}) {
  return (
    <DetailSection title="External links">
      <DetailRow label="Google URL">
        <ReadOnlyValue value={<LinkValue href={location.contact.url || null} />} />
      </DetailRow>
      <ControlledInputRow
        label="Place ID"
        name="placeId"
        control={form.control}
        placeholder="Google Place ID"
      />
      <ControlledInputRow
        label="TripAdvisor URL"
        name="tripadvisorUrl"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "tripadvisorUrl")}
        placeholder="https://www.tripadvisor.com/…"
      />
      <ControlledTextareaRow
        label="TripAdvisor meal types"
        name="tripadvisorMealTypes"
        control={form.control}
        placeholder="Comma or line-separated (e.g. Lunch, Dinner, Drinks)"
        description="Safety override. Leave blank to keep current value."
        rows={2}
      />
      <ControlledTextareaRow
        label="TripAdvisor cuisines"
        name="tripadvisorCuisines"
        control={form.control}
        placeholder="Comma or line-separated"
        description="Safety override. Leave blank to keep current value."
        rows={2}
      />
    </DetailSection>
  );
}
