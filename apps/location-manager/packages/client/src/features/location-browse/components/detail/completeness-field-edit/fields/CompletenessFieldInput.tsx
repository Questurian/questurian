import { Input } from "@client/components/ui";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { NightlifeMultiOptionTable, NightlifeSingleOptionTable, TaxonomyLocationEditor } from "@client/shared/components/forms";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import { isNightlifeFieldKey, isNightlifeMultiFieldKey } from "@client/shared/lib/nightlife-details";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";
import type { FieldDef } from "../completeness-field-edit.types";
import type { CompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { CATEGORIES, NIGHTLIFE_MULTI_FIELD_OPTIONS, NIGHTLIFE_SINGLE_FIELD_OPTIONS, PRICE_LEVELS, TIMEZONE_OPTIONS } from "../field-options";
import { OperationHoursFieldEditor } from "../operation-hours/OperationHoursFieldEditor";
import { CoordinatesFieldEditor } from "./CoordinatesFieldEditor";
import { CuisinesFieldEditor } from "./CuisinesFieldEditor";
import { IdealForFieldEditor } from "./IdealForFieldEditor";
import { NeighborhoodDescriptionFieldEditor } from "./NeighborhoodDescriptionFieldEditor";
import { isRawJsonFieldKey, RawJsonFieldInput } from "./RawJsonFieldInput";

interface CompletenessFieldInputProps {
  field: FieldDef;
  category: string;
  draft: CompletenessFieldDraft;
  isPending: boolean;
}

export function CompletenessFieldInput({
  field,
  category,
  draft,
  isPending,
}: CompletenessFieldInputProps) {
  const {
    value,
    setValue,
    nightlifeMultiDraft,
    setNightlifeMultiDraft,
    locationTypes,
    isLoadingTypes,
    taxonomyLocationKey,
    taxonomyDistrict,
    setTaxonomyLocationKey,
    setTaxonomyDistrict,
    coordinateDraft,
    setCoordinateDraft,
    copyText,
    canGenerateNeighborhoodDescription,
    locationHierarchyLabel,
    isGeneratingNeighborhoodDescription,
    generateNeighborhoodDescription,
    idealForDraft,
    availableIdealForGroups,
    addIdealForTag,
    removeIdealForTag,
    cuisinesDraft,
    availableCuisineOptions,
    availableCuisineGroups,
    setCuisinesDraft,
    dayEntries,
    setDayEntries,
  } = draft;

  if (isNightlifeFieldKey(field.key)) {
    if (isNightlifeMultiFieldKey(field.key)) {
      return (
        <NightlifeMultiOptionTable
          label={field.label}
          options={NIGHTLIFE_MULTI_FIELD_OPTIONS[field.key] ?? []}
          values={nightlifeMultiDraft}
          onToggle={(selectedValue) =>
            setNightlifeMultiDraft((prev) =>
              field.key === "nightlife.music"
                ? toggleNightlifeMusicSelection(prev, selectedValue)
                : prev.includes(selectedValue)
                  ? prev.filter((item) => item !== selectedValue)
                  : [...prev, selectedValue]
            )
          }
        />
      );
    }

    return (
      <NightlifeSingleOptionTable
        label={field.label}
        options={NIGHTLIFE_SINGLE_FIELD_OPTIONS[field.key] ?? []}
        value={value}
        onChange={setValue}
        placeholder={`Select ${field.label.toLowerCase()}`}
      />
    );
  }

  switch (field.key) {
    case "category":
      return (
        <Select value={value || undefined} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "priceLevel":
      return (
        <Select value={value || undefined} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select price level" /></SelectTrigger>
          <SelectContent>{PRICE_LEVELS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "type":
      return (
        <Select value={value || undefined} onValueChange={setValue} disabled={isLoadingTypes}>
          <SelectTrigger><SelectValue placeholder={isLoadingTypes ? "Loading types..." : category === "dining" ? "Select establishment type" : "Select a type"} /></SelectTrigger>
          <SelectContent>
            {category === "dining"
              ? DINING_ESTABLISHMENT_TYPE_GROUPS.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{group.label}</SelectLabel>
                    {group.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    {groupIndex < DINING_ESTABLISHMENT_TYPE_GROUPS.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))
              : locationTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "locationKey":
    case "district":
      return (
        <TaxonomyLocationEditor
          locationKey={taxonomyLocationKey}
          district={taxonomyDistrict}
          onLocationKeyChange={setTaxonomyLocationKey}
          onDistrictChange={setTaxonomyDistrict}
          locationKeyError={taxonomyLocationKey.trim().length > 0 && !isValidLocationKey(taxonomyLocationKey.trim()) ? "Location Key must be lowercase kebab-case (country|city|neighborhood)." : undefined}
          disabled={isPending}
        />
      );
    case "coordinates":
      return <CoordinatesFieldEditor value={coordinateDraft} onChange={setCoordinateDraft} onCopy={copyText} />;
    case "ianaTimeId":
      return (
        <Select value={value || undefined} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select a time zone" /></SelectTrigger>
          <SelectContent>{TIMEZONE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "neighborhoodDescription":
      return <NeighborhoodDescriptionFieldEditor value={value} canGenerate={canGenerateNeighborhoodDescription} locationHierarchyLabel={locationHierarchyLabel} isPending={isPending} isGenerating={isGeneratingNeighborhoodDescription} onChange={setValue} onGenerate={() => generateNeighborhoodDescription()} />;
    case "idealFor":
      return <IdealForFieldEditor value={idealForDraft} availableGroups={availableIdealForGroups} onAdd={addIdealForTag} onRemove={removeIdealForTag} />;
    case "cuisines":
      return <CuisinesFieldEditor value={cuisinesDraft} availableOptions={availableCuisineOptions} availableGroups={availableCuisineGroups} onChange={setCuisinesDraft} />;
    case "operationHours":
      return <OperationHoursFieldEditor dayEntries={dayEntries} onChange={setDayEntries} />;
    default:
      if (isRawJsonFieldKey(field.key)) {
        return <RawJsonFieldInput fieldKey={field.key} value={value} onChange={setValue} />;
      }
      return <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Enter ${field.label.toLowerCase()}`} type={field.key === "website" || field.key === "bookingUrl" ? "url" : "text"} />;
  }
}
