import type { Dispatch, SetStateAction } from "react";
import { Input, Textarea } from "@client/components/ui";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { NightlifeMultiOptionTable, NightlifeSingleOptionTable, TaxonomyLocationEditor } from "@client/shared/components/forms";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import { isNightlifeFieldKey, isNightlifeMultiFieldKey } from "@client/shared/lib/nightlife-details";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";
import type { CoordinateDraft, FieldDef } from "../completeness-field-edit.types";
import { CATEGORIES, NIGHTLIFE_MULTI_FIELD_OPTIONS, NIGHTLIFE_SINGLE_FIELD_OPTIONS, PRICE_LEVELS, TIMEZONE_OPTIONS } from "../field-options";
import type { DayEntry } from "../operation-hours/operation-hours-utils";
import { OperationHoursFieldEditor } from "../operation-hours/OperationHoursFieldEditor";
import { CoordinatesFieldEditor } from "./CoordinatesFieldEditor";
import { CuisinesFieldEditor } from "./CuisinesFieldEditor";
import { IdealForFieldEditor } from "./IdealForFieldEditor";
import { NeighborhoodDescriptionFieldEditor } from "./NeighborhoodDescriptionFieldEditor";

interface OptionGroup {
  label: string;
}

interface IdealForOptionGroup extends OptionGroup {
  tags: string[];
}

interface CuisineOptionGroup extends OptionGroup {
  options: string[];
}

interface LocationTypeOption {
  value: string;
  label: string;
}

interface CompletenessFieldInputProps {
  field: FieldDef;
  category: string;
  value: string;
  onValueChange: (value: string) => void;
  nightlifeMultiDraft: string[];
  setNightlifeMultiDraft: Dispatch<SetStateAction<string[]>>;
  locationTypes: LocationTypeOption[];
  isLoadingTypes: boolean;
  taxonomyLocationKey: string;
  taxonomyDistrict: string;
  onTaxonomyLocationKeyChange: (value: string) => void;
  onTaxonomyDistrictChange: (value: string) => void;
  coordinateDraft: CoordinateDraft;
  onCoordinateDraftChange: (value: CoordinateDraft) => void;
  onCopyText: (text: string, label: string) => void;
  canGenerateNeighborhoodDescription: boolean;
  locationHierarchyLabel: string | null;
  isPending: boolean;
  isGeneratingNeighborhoodDescription: boolean;
  onGenerateNeighborhoodDescription: () => void;
  idealForDraft: string[];
  availableIdealForGroups: IdealForOptionGroup[];
  onAddIdealForTag: (tag: string) => void;
  onRemoveIdealForTag: (tag: string) => void;
  cuisinesDraft: string[];
  availableCuisineOptions: string[];
  availableCuisineGroups: CuisineOptionGroup[];
  onCuisinesDraftChange: (value: string[]) => void;
  dayEntries: DayEntry[];
  onDayEntriesChange: (value: DayEntry[]) => void;
}

export function CompletenessFieldInput({
  field,
  category,
  value,
  onValueChange,
  nightlifeMultiDraft,
  setNightlifeMultiDraft,
  locationTypes,
  isLoadingTypes,
  taxonomyLocationKey,
  taxonomyDistrict,
  onTaxonomyLocationKeyChange,
  onTaxonomyDistrictChange,
  coordinateDraft,
  onCoordinateDraftChange,
  onCopyText,
  canGenerateNeighborhoodDescription,
  locationHierarchyLabel,
  isPending,
  isGeneratingNeighborhoodDescription,
  onGenerateNeighborhoodDescription,
  idealForDraft,
  availableIdealForGroups,
  onAddIdealForTag,
  onRemoveIdealForTag,
  cuisinesDraft,
  availableCuisineOptions,
  availableCuisineGroups,
  onCuisinesDraftChange,
  dayEntries,
  onDayEntriesChange,
}: CompletenessFieldInputProps) {
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
        onChange={onValueChange}
        placeholder={`Select ${field.label.toLowerCase()}`}
      />
    );
  }

  switch (field.key) {
    case "category":
      return (
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "priceLevel":
      return (
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger><SelectValue placeholder="Select price level" /></SelectTrigger>
          <SelectContent>{PRICE_LEVELS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "type":
      return (
        <Select value={value || undefined} onValueChange={onValueChange} disabled={isLoadingTypes}>
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
          onLocationKeyChange={onTaxonomyLocationKeyChange}
          onDistrictChange={onTaxonomyDistrictChange}
          locationKeyError={taxonomyLocationKey.trim().length > 0 && !isValidLocationKey(taxonomyLocationKey.trim()) ? "Location Key must be lowercase kebab-case (country|city|neighborhood)." : undefined}
          disabled={isPending}
        />
      );
    case "nightlifeDetails":
      return <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={12} placeholder='{"name":"Venue Name","price_tier":"$$$"}' className="font-mono text-xs" />;
    case "accommodationsDetails":
      return <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={12} placeholder='{"core":{"name":"The Meridian Grand","price":"$$$$"}}' className="font-mono text-xs" />;
    case "attractionsDetails":
      return <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={12} placeholder='{"core":{"attraction_type":"museum","pricing":"$$"}}' className="font-mono text-xs" />;
    case "keyLocationsDetails":
      return <Textarea value={value} onChange={(event) => onValueChange(event.target.value)} rows={12} placeholder='{"location_type":"airport","status":"active"}' className="font-mono text-xs" />;
    case "coordinates":
      return <CoordinatesFieldEditor value={coordinateDraft} onChange={onCoordinateDraftChange} onCopy={onCopyText} />;
    case "ianaTimeId":
      return (
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger><SelectValue placeholder="Select a time zone" /></SelectTrigger>
          <SelectContent>{TIMEZONE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "neighborhoodDescription":
      return <NeighborhoodDescriptionFieldEditor value={value} canGenerate={canGenerateNeighborhoodDescription} locationHierarchyLabel={locationHierarchyLabel} isPending={isPending} isGenerating={isGeneratingNeighborhoodDescription} onChange={onValueChange} onGenerate={onGenerateNeighborhoodDescription} />;
    case "idealFor":
      return <IdealForFieldEditor value={idealForDraft} availableGroups={availableIdealForGroups} onAdd={onAddIdealForTag} onRemove={onRemoveIdealForTag} />;
    case "cuisines":
      return <CuisinesFieldEditor value={cuisinesDraft} availableOptions={availableCuisineOptions} availableGroups={availableCuisineGroups} onChange={onCuisinesDraftChange} />;
    case "operationHours":
      return <OperationHoursFieldEditor dayEntries={dayEntries} onChange={onDayEntriesChange} />;
    default:
      return <Input value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={`Enter ${field.label.toLowerCase()}`} type={field.key === "website" || field.key === "bookingUrl" ? "url" : "text"} />;
  }
}
