import type { ReactNode } from "react";
import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
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
import type { FieldDef } from "./completeness-field-edit.types";
import type { CompletenessFieldDraft } from "./drafts/use-completeness-field-draft";
import { PRICE_LEVELS, TIMEZONE_OPTIONS } from "./field-options";
import { parseCoordinateInput } from "./field-value-utils";
import { buildOperationHoursJson } from "./operation-hours/operation-hours-utils";
import { OperationHoursFieldEditor } from "./operation-hours/OperationHoursFieldEditor";
import { CoordinatesFieldEditor } from "./fields/CoordinatesFieldEditor";
import { CuisinesFieldEditor } from "./fields/CuisinesFieldEditor";
import { IdealForFieldEditor } from "./fields/IdealForFieldEditor";
import { NeighborhoodDescriptionFieldEditor } from "./fields/NeighborhoodDescriptionFieldEditor";
import { RawJsonFieldInput } from "./fields/RawJsonFieldInput";
import type { SaveStrategy } from "./submission/save-strategy";

/**
 * Single source of truth for the "core" completeness fields — every field that
 * is not a nightlife field (see shared/lib/nightlife-details.ts) or a granular
 * detail field (see completeness-detail-fields.ts). Adding a field means adding
 * one entry here with its `draftInit`, `editor`, and `saveStrategy`, instead of
 * editing three separate behaviour maps (draft init / render switch / save).
 */
export interface CoreFieldEditorContext {
  field: FieldDef;
  category: string;
  draft: CompletenessFieldDraft;
  isPending: boolean;
}

export interface CoreFieldConfig {
  /** Seeds the shared `value` draft slice when the editor opens. */
  draftInit?: (location: LocationResponse) => string;
  /** Renders the field editor. Omitted for fields rendered by the modal shell
   *  itself (e.g. `media`, `contactUrl`). */
  editor?: (context: CoreFieldEditorContext) => ReactNode;
  /** Whether the draft is saveable and how it persists. */
  saveStrategy: SaveStrategy;
}

// --- Editor helpers -------------------------------------------------------

function textEditor(type: "text" | "url" = "text") {
  return ({ field, draft }: CoreFieldEditorContext) => (
    <Input
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`}
      type={type}
    />
  );
}

function selectEditor(
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

function rawJsonEditor({ field, draft }: CoreFieldEditorContext) {
  return <RawJsonFieldInput fieldKey={field.key} value={draft.value} onChange={draft.setValue} />;
}

// --- Save-strategy helpers ------------------------------------------------

/**
 * Strategy for plain string-backed fields. `buildPayload` returns the update
 * payload for the trimmed draft value, or `null` when the value cannot be
 * saved (which also disables the Save button).
 */
function simpleValueStrategy(
  buildPayload: (trimmed: string) => Partial<UpdateMapsRequest> | null
): SaveStrategy {
  return {
    canSave: ({ draft }) => buildPayload(draft.value.trim()) !== null,
    save: ({ field, draft, save }) => {
      const payload = buildPayload(draft.value.trim());
      if (payload) {
        save(payload as UpdateMapsRequest, `${field.label} saved`, `Failed to save ${field.label}`);
      }
    },
  };
}

function getCoordinateValidation(
  draft: CompletenessFieldDraft
): { valid: true; lat: number; lng: number } | { valid: false; message: string } {
  const lat = parseCoordinateInput(draft.coordinateDraft.lat);
  const lng = parseCoordinateInput(draft.coordinateDraft.lng);
  if (lat == null || lng == null) return { valid: false, message: "Latitude and longitude are required" };
  if (lat < -90 || lat > 90) return { valid: false, message: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { valid: false, message: "Longitude must be between -180 and 180" };
  return { valid: true, lat, lng };
}

const taxonomyStrategy: SaveStrategy = {
  canSave: ({ draft }) => {
    const locationKey = draft.taxonomyLocationKey.trim();
    return !locationKey || isValidLocationKey(locationKey);
  },
  save: ({ draft, save, showValidationError }) => {
    const locationKey = draft.taxonomyLocationKey.trim();
    if (locationKey && !isValidLocationKey(locationKey)) {
      showValidationError("Location Key must be lowercase kebab-case (country|city|neighborhood)");
      return;
    }
    save(
      {
        locationKey: locationKey || undefined,
        district: draft.taxonomyDistrict.trim() || null,
        autoApproveTaxonomy: true,
      },
      "Location taxonomy saved",
      "Failed to save location taxonomy"
    );
  },
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRawJsonDraft(
  value: string
): { valid: true; value: Record<string, unknown> | null } | { valid: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null) return { valid: true, value: null };
    if (!isPlainRecord(parsed)) return { valid: false, message: "JSON must be an object" };
    return { valid: true, value: parsed };
  } catch {
    return { valid: false, message: "Enter valid JSON before saving" };
  }
}

function rawJsonStrategy(
  fieldKey: "nightlifeDetails" | "accommodationsDetails" | "attractionsDetails" | "keyLocationsDetails"
): SaveStrategy {
  return {
    canSave: ({ draft }) => parseRawJsonDraft(draft.value).valid,
    save: ({ field, draft, save, showValidationError }) => {
      const parsed = parseRawJsonDraft(draft.value);
      if (!parsed.valid) {
        showValidationError(parsed.message);
        return;
      }
      save({ [fieldKey]: parsed.value }, `${field.label} saved`, `Failed to save ${field.label}`);
    },
  };
}

function detailsJson(value: unknown): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

// --- Registry -------------------------------------------------------------

const CORE_FIELD_REGISTRY = {
  title: {
    draftInit: (l) => l.title?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ title: t || undefined })),
  },
  name: {
    draftInit: (l) => l.source?.name?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ name: t || undefined })),
  },
  sourceAddress: {
    draftInit: (l) => l.source?.address?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ address: t || undefined })),
  },
  type: {
    draftInit: (l) => l.type?.trim() ?? "",
    editor: ({ category, draft }) => (
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
    ),
    saveStrategy: simpleValueStrategy((t) => ({ type: t || undefined })),
  },
  locationKey: {
    draftInit: (l) => l.locationKey?.trim() ?? "",
    editor: taxonomyEditor,
    saveStrategy: taxonomyStrategy,
  },
  district: {
    draftInit: (l) => l.district?.trim() ?? "",
    editor: taxonomyEditor,
    saveStrategy: taxonomyStrategy,
  },
  coordinates: {
    editor: ({ draft }) => (
      <CoordinatesFieldEditor value={draft.coordinateDraft} onChange={draft.setCoordinateDraft} onCopy={draft.copyText} />
    ),
    saveStrategy: {
      canSave: ({ draft }) => getCoordinateValidation(draft).valid,
      save: ({ draft, save, showValidationError }) => {
        const validation = getCoordinateValidation(draft);
        if (!validation.valid) {
          showValidationError(validation.message);
          return;
        }
        save({ lat: validation.lat, lng: validation.lng }, "Coordinates saved", "Failed to save coordinates");
      },
    },
  },
  ianaTimeId: {
    draftInit: (l) => l.ianaTimeId?.trim() ?? "",
    editor: selectEditor(TIMEZONE_OPTIONS, "Select a time zone"),
    saveStrategy: simpleValueStrategy((t) => ({ ianaTimeId: t || null })),
  },
  countryCode: {
    draftInit: (l) => l.contact?.countryCode?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ countryCode: t || undefined })),
  },
  phone: {
    draftInit: (l) => l.contact?.phoneNumber?.trim() ?? "",
    editor: ({ draft }) => (
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
    ),
    saveStrategy: {
      canSave: () => true,
      save: ({ draft, save }) =>
        save(
          draft.phoneNotAvailable
            ? { phoneNumber: "", phoneUnavailable: true }
            : { phoneNumber: draft.value.trim(), phoneUnavailable: false },
          "Phone saved",
          "Failed to save phone"
        ),
    },
  },
  website: {
    draftInit: (l) => l.contact?.website?.trim() ?? "",
    editor: textEditor("url"),
    saveStrategy: simpleValueStrategy((t) => ({ website: t || undefined })),
  },
  bookingUrl: {
    draftInit: (l) => l.bookingUrl?.trim() ?? "",
    editor: textEditor("url"),
    saveStrategy: simpleValueStrategy((t) => ({ bookingUrl: t || null })),
  },
  contactUrl: {
    draftInit: (l) => l.contact?.url?.trim() ?? "",
    saveStrategy: {
      canSave: ({ locationDetail }) =>
        Boolean(locationDetail.source?.name?.trim() && locationDetail.source?.address?.trim()),
      save: ({ locationDetail, save, showValidationError }) => {
        const name = locationDetail.source?.name?.trim();
        const address = locationDetail.source?.address?.trim();
        if (!name || !address) {
          showValidationError("Name and Source Address are required to generate Google URL");
          return;
        }
        save({ name, address }, "Google URL regenerated", "Failed to regenerate Google URL");
      },
    },
  },
  tripadvisorUrl: {
    draftInit: (l) => l.tripadvisorUrl?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ tripadvisorUrl: t || undefined })),
  },
  neighborhoodDescription: {
    draftInit: (l) => l.neighborhoodDescription?.trim() ?? "",
    editor: ({ draft, isPending }) => (
      <NeighborhoodDescriptionFieldEditor
        value={draft.value}
        canGenerate={draft.canGenerateNeighborhoodDescription}
        locationHierarchyLabel={draft.locationHierarchyLabel}
        isPending={isPending}
        isGenerating={draft.isGeneratingNeighborhoodDescription}
        onChange={draft.setValue}
        onGenerate={() => draft.generateNeighborhoodDescription()}
      />
    ),
    saveStrategy: simpleValueStrategy((t) => ({ neighborhoodDescription: t || undefined })),
  },
  idealFor: {
    draftInit: (l) => (Array.isArray(l.idealFor) ? l.idealFor.join(", ") : ""),
    editor: ({ draft }) => (
      <IdealForFieldEditor
        value={draft.idealForDraft}
        availableGroups={draft.availableIdealForGroups}
        onAdd={draft.addIdealForTag}
        onRemove={draft.removeIdealForTag}
      />
    ),
    saveStrategy: {
      canSave: ({ draft }) => draft.idealForDraft.length > 0,
      save: ({ draft, save, showValidationError }) => {
        if (!draft.idealForDraft.length) {
          showValidationError("Select at least one Ideal For tag");
          return;
        }
        save({ idealFor: draft.idealForDraft }, "Ideal For saved", "Failed to save Ideal For");
      },
    },
  },
  cuisines: {
    draftInit: (l) => (Array.isArray(l.tripadvisorCuisines) ? l.tripadvisorCuisines.join(", ") : ""),
    editor: ({ draft }) => (
      <CuisinesFieldEditor
        value={draft.cuisinesDraft}
        availableOptions={draft.availableCuisineOptions}
        availableGroups={draft.availableCuisineGroups}
        onChange={draft.setCuisinesDraft}
      />
    ),
    saveStrategy: {
      canSave: () => true,
      save: ({ draft, save }) =>
        save(
          { tripadvisorCuisines: draft.cuisinesDraft.length ? draft.cuisinesDraft : null },
          "Cuisines saved",
          "Failed to save cuisines"
        ),
    },
  },
  priceLevel: {
    draftInit: (l) => l.priceLevel?.trim() ?? "",
    editor: selectEditor(PRICE_LEVELS, "Select price level"),
    saveStrategy: simpleValueStrategy((t) => ({ priceLevel: t || null })),
  },
  operationHours: {
    draftInit: (l) => detailsJson(l.operationHours),
    editor: ({ draft }) => <OperationHoursFieldEditor dayEntries={draft.dayEntries} onChange={draft.setDayEntries} />,
    saveStrategy: {
      canSave: () => true,
      save: ({ draft, save }) =>
        save({ operationHours: buildOperationHoursJson(draft.dayEntries) }, "Hours saved", "Failed to save hours"),
    },
  },
  media: {
    saveStrategy: {
      canSave: () => true,
      save: ({ close }) => close(),
    },
  },
  nightlifeDetails: {
    draftInit: (l) => detailsJson(l.nightlifeDetails),
    editor: rawJsonEditor,
    saveStrategy: rawJsonStrategy("nightlifeDetails"),
  },
  accommodationsDetails: {
    draftInit: (l) => detailsJson(l.accommodationsDetails),
    editor: rawJsonEditor,
    saveStrategy: rawJsonStrategy("accommodationsDetails"),
  },
  attractionsDetails: {
    draftInit: (l) => detailsJson(l.attractionsDetails),
    editor: rawJsonEditor,
    saveStrategy: rawJsonStrategy("attractionsDetails"),
  },
  keyLocationsDetails: {
    draftInit: (l) => detailsJson(l.keyLocationsDetails),
    editor: rawJsonEditor,
    saveStrategy: rawJsonStrategy("keyLocationsDetails"),
  },
} satisfies Record<string, CoreFieldConfig>;

export type CompletenessFieldKey = keyof typeof CORE_FIELD_REGISTRY;

function taxonomyEditor({ draft, isPending }: CoreFieldEditorContext) {
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

export function getCoreFieldConfig(fieldKey: string): CoreFieldConfig | undefined {
  return (CORE_FIELD_REGISTRY as Record<string, CoreFieldConfig>)[fieldKey];
}

export function isCoreFieldKey(fieldKey: string): fieldKey is CompletenessFieldKey {
  return fieldKey in CORE_FIELD_REGISTRY;
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
