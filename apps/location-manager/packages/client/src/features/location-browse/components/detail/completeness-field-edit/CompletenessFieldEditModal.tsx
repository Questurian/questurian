import type { LocationResponse } from "@client/shared/services/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button, Label } from "@client/components/ui";
import { isNightlifeFieldKey } from "@client/shared/lib/nightlife-details";
import type { FieldDef } from "./completeness-field-edit.types";
import { useCompletenessFieldDraft } from "./drafts/use-completeness-field-draft";
import { CompletenessFieldInput } from "./fields/CompletenessFieldInput";
import { getFieldEditDescription } from "./presentation/get-field-edit-description";
import { useSaveCompletenessField } from "./submission/use-save-completeness-field";

interface CompletenessFieldEditModalProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompletenessFieldEditModal({
  field,
  locationDetail,
  open,
  onOpenChange,
}: CompletenessFieldEditModalProps) {
  const draft = useCompletenessFieldDraft({ field, locationDetail, open });
  const { handleSave, isPending, canSave } = useSaveCompletenessField({
    field,
    locationDetail,
    draft,
    onClose: () => onOpenChange(false),
  });
  const fieldInput = (
    <CompletenessFieldInput
      field={field}
      category={locationDetail.category}
      value={draft.value}
      onValueChange={draft.setValue}
      nightlifeMultiDraft={draft.nightlifeMultiDraft}
      setNightlifeMultiDraft={draft.setNightlifeMultiDraft}
      locationTypes={draft.locationTypes}
      isLoadingTypes={draft.isLoadingTypes}
      taxonomyLocationKey={draft.taxonomyLocationKey}
      taxonomyDistrict={draft.taxonomyDistrict}
      onTaxonomyLocationKeyChange={draft.setTaxonomyLocationKey}
      onTaxonomyDistrictChange={draft.setTaxonomyDistrict}
      coordinateDraft={draft.coordinateDraft}
      onCoordinateDraftChange={draft.setCoordinateDraft}
      onCopyText={draft.copyText}
      canGenerateNeighborhoodDescription={draft.canGenerateNeighborhoodDescription}
      locationHierarchyLabel={draft.locationHierarchyLabel}
      isPending={isPending}
      isGeneratingNeighborhoodDescription={draft.isGeneratingNeighborhoodDescription}
      onGenerateNeighborhoodDescription={() => draft.generateNeighborhoodDescription()}
      idealForDraft={draft.idealForDraft}
      availableIdealForGroups={draft.availableIdealForGroups}
      onAddIdealForTag={draft.addIdealForTag}
      onRemoveIdealForTag={draft.removeIdealForTag}
      cuisinesDraft={draft.cuisinesDraft}
      availableCuisineOptions={draft.availableCuisineOptions}
      availableCuisineGroups={draft.availableCuisineGroups}
      onCuisinesDraftChange={draft.setCuisinesDraft}
      dayEntries={draft.dayEntries}
      onDayEntriesChange={draft.setDayEntries}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={getDialogWidth(field.key)}>
        <DialogHeader>
          <DialogTitle>Edit {field.label}</DialogTitle>
          <DialogDescription>
            {getFieldEditDescription(field, locationDetail.category)}
          </DialogDescription>
        </DialogHeader>
        {field.key === "media" ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Edit below in the Images/Instagram section.
          </div>
        ) : field.key === "contactUrl" ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>Source Name: {locationDetail.source?.name || "Missing"}</p>
            <p>Source Address: {locationDetail.source?.address || "Missing"}</p>
          </div>
        ) : isWideField(field.key) ? (
          <div className="space-y-4 py-2">{fieldInput}</div>
        ) : (
          <div className="space-y-2 py-2">
            <Label htmlFor={`edit-${field.key}`}>{field.label}</Label>
            {fieldInput}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !canSave}>
            {isPending ? "Saving..." : field.key === "media" ? "Close" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDialogWidth(fieldKey: string) {
  if (fieldKey === "operationHours" || isNightlifeFieldKey(fieldKey)) {
    return "max-w-2xl max-h-[90vh] overflow-y-auto";
  }
  return fieldKey === "neighborhoodDescription" ? "sm:max-w-lg" : "sm:max-w-md";
}

function isWideField(fieldKey: string) {
  return (
    fieldKey === "operationHours" ||
    fieldKey === "locationKey" ||
    fieldKey === "district" ||
    fieldKey === "coordinates" ||
    isNightlifeFieldKey(fieldKey)
  );
}
