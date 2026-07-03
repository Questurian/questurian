import { lazy, Suspense } from "react";
import { Clock } from "lucide-react";
import { Button, SelectItem } from "@client/components/ui";
import { FormTagMultiSelect } from "@client/shared/components/forms";
import { getIdealForGroups } from "@shared/types/location-ideal-for";
import type { LocationCategory } from "@shared/types/location-category";
import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import { useLocationDetailForm } from "../../hooks/useLocationDetailForm";
import { DetailSection, DetailRow } from "../DetailLayout";
import { ControlledSelectRow, ControlledTextareaRow } from "./ControlledDetailRows";
import { fieldProvenance } from "./locationDetail.utils";

const OperationHoursModal = lazy(() =>
  import("../OperationHoursModal").then((m) => ({ default: m.OperationHoursModal }))
);

export function DetailsSection({
  form,
  category,
  location,
  operationHoursModalOpen,
  setOperationHoursModalOpen,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  category: LocationCategory;
  location: LocationResponse;
  operationHoursModalOpen: boolean;
  setOperationHoursModalOpen: (open: boolean) => void;
}) {
  const idealForOptionGroups = getIdealForGroups(category).map((group) => ({
    label: group.label,
    options: group.tags.map((tag) => ({ value: tag, label: tag })),
  }));
  const shouldShowIdealFor = category !== "attractions" && idealForOptionGroups.length > 0;
  const idealForProvenance = fieldProvenance(location.provenance, "idealFor");

  return (
    <DetailSection title="Details">
      {shouldShowIdealFor ? (
        <DetailRow
          label="Ideal for"
          multiline
          description="Choose 1 to 4 tags"
          provenance={idealForProvenance}
        >
          <FormTagMultiSelect
            name="idealFor"
            label=""
            control={form.control}
            optionGroups={idealForOptionGroups}
            maxSelections={4}
            allowDirectTagArrayInput
          />
        </DetailRow>
      ) : null}

      <ControlledSelectRow
        label="Price level"
        name="priceLevel"
        control={form.control}
        placeholder="Select price level"
      >
        <SelectItem value="free">free</SelectItem>
        <SelectItem value="$">$</SelectItem>
        <SelectItem value="$$">$$</SelectItem>
        <SelectItem value="$$$">$$$</SelectItem>
        <SelectItem value="$$$$">$$$$</SelectItem>
      </ControlledSelectRow>

      <DetailRow label="Operation hours">
        <div className="flex items-center gap-2 flex-wrap py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setOperationHoursModalOpen(true)}
          >
            <Clock className="h-4 w-4" />
            {form.watch("operationHours") ? "Edit schedule" : "Set schedule"}
          </Button>
          {form.watch("operationHours") ? (
            <span className="text-xs text-muted-foreground">Schedule configured</span>
          ) : null}
        </div>
        {operationHoursModalOpen ? (
          <Suspense fallback={null}>
            <OperationHoursModal
              open={operationHoursModalOpen}
              onOpenChange={setOperationHoursModalOpen}
              value={form.watch("operationHours") ?? ""}
              onSave={(json) => {
                form.setValue("operationHours", json, { shouldDirty: true });
              }}
            />
          </Suspense>
        ) : null}
      </DetailRow>

      <ControlledTextareaRow
        label="Neighborhood description"
        name="neighborhoodDescription"
        control={form.control}
        placeholder="Short neighborhood description"
        rows={4}
      />

      {category === "key_locations" ? (
        <ControlledTextareaRow
          label="Key locations details (JSON)"
          name="keyLocationsDetails"
          control={form.control}
          placeholder='{"location_type":"airport","status":"active"}'
          description="Structured JSON profile for key locations."
          rows={10}
        />
      ) : null}
    </DetailSection>
  );
}
