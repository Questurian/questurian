import { Input } from "@client/components/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import { TaxonomyLocationEditor } from "@client/shared/components/forms";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";
import { OperationHoursFieldEditor } from "./operation-hours/OperationHoursFieldEditor";
import { CoordinatesFieldEditor } from "./fields/CoordinatesFieldEditor";
import { CuisinesFieldEditor } from "./fields/CuisinesFieldEditor";
import { IdealForFieldEditor } from "./fields/IdealForFieldEditor";
import { NeighborhoodDescriptionFieldEditor } from "./fields/NeighborhoodDescriptionFieldEditor";
import { RawJsonFieldInput } from "./fields/RawJsonFieldInput";
import type { CoreFieldEditorContext } from "./core-field.types";

export function textEditor(type: "text" | "url" = "text") {
  return ({ field, draft }: CoreFieldEditorContext) => (
    <Input
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`}
      type={type}
    />
  );
}

export function selectEditor(
  options: ReadonlyArray<{ value: string; label: string }>,
  placeholder: string
) {
  return ({ draft }: CoreFieldEditorContext) => (
    <Select value={draft.value || undefined} onValueChange={draft.setValue}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function rawJsonEditor({ field, draft }: CoreFieldEditorContext) {
  return <RawJsonFieldInput fieldKey={field.key} value={draft.value} onChange={draft.setValue} />;
}

export function taxonomyEditor({ draft, isPending }: CoreFieldEditorContext) {
  return (
    <TaxonomyLocationEditor
      locationKey={draft.taxonomyLocationKey}
      district={draft.taxonomyDistrict}
      onLocationKeyChange={draft.setTaxonomyLocationKey}
      onDistrictChange={draft.setTaxonomyDistrict}
      locationKeyError={
        draft.taxonomyLocationKey.trim().length > 0 && !isValidLocationKey(draft.taxonomyLocationKey.trim())
          ? "Location Key must be lowercase kebab-case (country|city|neighborhood)."
          : undefined
      }
      disabled={isPending}
    />
  );
}

/** Dining uses grouped establishment types; every other category uses the flat
 *  list loaded into the draft. */
export function typeEditor({ category, draft }: CoreFieldEditorContext) {
  return (
    <Select value={draft.value || undefined} onValueChange={draft.setValue} disabled={draft.isLoadingTypes}>
      <SelectTrigger>
        <SelectValue
          placeholder={
            draft.isLoadingTypes
              ? "Loading types..."
              : category === "dining"
                ? "Select establishment type"
                : "Select a type"
          }
        />
      </SelectTrigger>
      <SelectContent>
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
          : draft.locationTypes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}

export function phoneEditor({ draft }: CoreFieldEditorContext) {
  return (
    <div className="space-y-2">
      <Input
        value={draft.value}
        onChange={(event) => draft.setValue(event.target.value)}
        placeholder="Enter phone"
        disabled={draft.phoneNotAvailable}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={draft.phoneNotAvailable}
          onChange={(event) => {
            const checked = event.target.checked;
            draft.setPhoneNotAvailable(checked);
            if (checked) draft.setValue("");
          }}
        />
        Phone not available
      </label>
    </div>
  );
}

export function coordinatesEditor({ draft }: CoreFieldEditorContext) {
  return (
    <CoordinatesFieldEditor value={draft.coordinateDraft} onChange={draft.setCoordinateDraft} onCopy={draft.copyText} />
  );
}

export function neighborhoodDescriptionEditor({ draft, isPending }: CoreFieldEditorContext) {
  return (
    <NeighborhoodDescriptionFieldEditor
      value={draft.value}
      canGenerate={draft.canGenerateNeighborhoodDescription}
      locationHierarchyLabel={draft.locationHierarchyLabel}
      isPending={isPending}
      isGenerating={draft.isGeneratingNeighborhoodDescription}
      onChange={draft.setValue}
      onGenerate={() => draft.generateNeighborhoodDescription()}
    />
  );
}

export function idealForEditor({ draft }: CoreFieldEditorContext) {
  return (
    <IdealForFieldEditor
      value={draft.idealForDraft}
      availableGroups={draft.availableIdealForGroups}
      onAdd={draft.addIdealForTag}
      onRemove={draft.removeIdealForTag}
    />
  );
}

export function cuisinesEditor({ draft }: CoreFieldEditorContext) {
  return (
    <CuisinesFieldEditor
      value={draft.cuisinesDraft}
      availableOptions={draft.availableCuisineOptions}
      availableGroups={draft.availableCuisineGroups}
      onChange={draft.setCuisinesDraft}
    />
  );
}

export function operationHoursEditor({ draft }: CoreFieldEditorContext) {
  return <OperationHoursFieldEditor dayEntries={draft.dayEntries} onChange={draft.setDayEntries} />;
}

/** Fallback editor for any field key without a bespoke editor (keeps the modal
 *  resilient if a new completeness key is surfaced before its editor lands). */
export function defaultFieldEditor({ field, draft }: CoreFieldEditorContext) {
  return (
    <Input
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`}
    />
  );
}
