import { PRICE_LEVELS, TIMEZONE_OPTIONS } from "./field-options";
import type { CoreFieldConfig } from "./core-field.types";
import {
  coordinatesEditor,
  cuisinesEditor,
  idealForEditor,
  neighborhoodDescriptionEditor,
  operationHoursEditor,
  phoneEditor,
  rawJsonEditor,
  selectEditor,
  taxonomyEditor,
  textEditor,
  typeEditor,
} from "./core-field-editors";
import {
  contactUrlStrategy,
  coordinatesStrategy,
  cuisinesStrategy,
  detailsJson,
  idealForStrategy,
  mediaStrategy,
  operationHoursStrategy,
  phoneStrategy,
  rawJsonStrategy,
  simpleValueStrategy,
  taxonomyStrategy,
  websiteStrategy,
} from "./core-field-save-strategies";

export type { CoreFieldConfig, CoreFieldEditorContext } from "./core-field.types";
export { defaultFieldEditor } from "./core-field-editors";

/**
 * Single source of truth for the "core" completeness fields — every field that
 * is not a nightlife field (see shared/lib/nightlife-details.ts) or a granular
 * detail field (see completeness-detail-fields.ts). Adding a field means adding
 * one entry here with its `draftInit`, `editor`, and `saveStrategy`, instead of
 * editing three separate behaviour maps (draft init / render switch / save).
 *
 * Editors live in ./core-field-editors, save strategies in
 * ./core-field-save-strategies, so this stays a readable table.
 */
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
    editor: typeEditor,
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
    editor: coordinatesEditor,
    saveStrategy: coordinatesStrategy,
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
    editor: phoneEditor,
    saveStrategy: phoneStrategy,
  },
  website: {
    draftInit: (l) => l.contact?.website?.trim() ?? "",
    editor: textEditor("url"),
    saveStrategy: websiteStrategy,
  },
  bookingUrl: {
    draftInit: (l) => l.bookingUrl?.trim() ?? "",
    editor: textEditor("url"),
    saveStrategy: simpleValueStrategy((t) => ({ bookingUrl: t })),
  },
  contactUrl: {
    draftInit: (l) => l.contact?.url?.trim() ?? "",
    saveStrategy: contactUrlStrategy,
  },
  tripadvisorUrl: {
    draftInit: (l) => l.tripadvisorUrl?.trim() ?? "",
    editor: textEditor(),
    saveStrategy: simpleValueStrategy((t) => ({ tripadvisorUrl: t || undefined })),
  },
  neighborhoodDescription: {
    draftInit: (l) => l.neighborhoodDescription?.trim() ?? "",
    editor: neighborhoodDescriptionEditor,
    saveStrategy: simpleValueStrategy((t) => ({ neighborhoodDescription: t || undefined })),
  },
  idealFor: {
    draftInit: (l) => (Array.isArray(l.idealFor) ? l.idealFor.join(", ") : ""),
    editor: idealForEditor,
    saveStrategy: idealForStrategy,
  },
  cuisines: {
    draftInit: (l) => (Array.isArray(l.tripadvisorCuisines) ? l.tripadvisorCuisines.join(", ") : ""),
    editor: cuisinesEditor,
    saveStrategy: cuisinesStrategy,
  },
  priceLevel: {
    draftInit: (l) => l.priceLevel?.trim() ?? "",
    editor: selectEditor(PRICE_LEVELS, "Select price level"),
    saveStrategy: simpleValueStrategy((t) => ({ priceLevel: t || null })),
  },
  operationHours: {
    draftInit: (l) => detailsJson(l.operationHours),
    editor: operationHoursEditor,
    saveStrategy: operationHoursStrategy,
  },
  media: {
    saveStrategy: mediaStrategy,
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

export function getCoreFieldConfig(fieldKey: string): CoreFieldConfig | undefined {
  return (CORE_FIELD_REGISTRY as Record<string, CoreFieldConfig>)[fieldKey];
}

export function isCoreFieldKey(fieldKey: string): fieldKey is CompletenessFieldKey {
  return fieldKey in CORE_FIELD_REGISTRY;
}
