import {
  ACCOMMODATIONS_SUGGESTION_FIELDS,
  type AccommodationsOption,
  type AccommodationsSuggestionFieldDefinition,
  type AccommodationsSuggestionFieldKey,
  type AccommodationsSuggestionKind,
} from "@shared/types/accommodations-options";
import type { LocationCategory } from "@shared/types/location-category";
import type {
  FieldSuggestionAiRequest,
  FieldSuggestionAiResponse,
} from "./clients/alt-text-api.client";
import type { AltTextApiClient } from "./clients/alt-text-api.client";

const MIN_AI_CONFIDENCE = 0.6;

export interface AccommodationsSuggestionSource {
  label: string;
  url?: string;
  snippet?: string;
}

export interface AccommodationsFieldSuggestionApiContext {
  googleUrl?: string | null;
  placeId?: string | null;
  locationKey?: string | null;
  district?: string | null;
  ianaTimeId?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  priceLevel?: string | null;
  accommodationsHints?: {
    source?: string;
    foursquareId?: string;
    price?: string;
    perfectFor?: string[];
    ac?: string;
    wifi?: string;
    parking?: string[];
    pool?: string[];
  } | null;
}

export interface AccommodationsFieldSuggestionRequest {
  category: LocationCategory;
  locationId?: number;
  fieldKey: AccommodationsSuggestionFieldKey;
  formValues: Record<string, unknown>;
  apiContext?: AccommodationsFieldSuggestionApiContext;
  allowedOptions?: AccommodationsOption[];
}

export interface AccommodationsFieldSuggestionResponse {
  fieldKey: AccommodationsSuggestionFieldKey;
  fieldLabel: string;
  kind: AccommodationsSuggestionKind;
  suggestion: string | string[] | null;
  confidence: number;
  reason: string;
  sources: AccommodationsSuggestionSource[];
  source: "existing-data" | "ai";
  error?: string;
}

export class AccommodationsFieldSuggestionService {
  constructor(private readonly aiClient: AltTextApiClient) {}

  async suggestField(
    request: AccommodationsFieldSuggestionRequest
  ): Promise<AccommodationsFieldSuggestionResponse> {
    const definition = resolveFieldDefinition(request);
    const existingSuggestion = buildExistingDataSuggestion(request, definition);
    if (existingSuggestion) {
      return existingSuggestion;
    }

    const aiResponse = await this.aiClient.suggestField(
      buildAiRequest(request, definition)
    );

    return normalizeAiResponse(request.fieldKey, definition, aiResponse);
  }
}

export function resolveFieldDefinition(
  request: AccommodationsFieldSuggestionRequest
): AccommodationsSuggestionFieldDefinition {
  const sharedDefinition = ACCOMMODATIONS_SUGGESTION_FIELDS.find(
    (field) => field.key === request.fieldKey
  );
  if (!sharedDefinition) {
    throw new Error(`Unsupported accommodations suggestion field: ${request.fieldKey}`);
  }

  if (sharedDefinition.key !== "type") {
    return sharedDefinition;
  }

  const allowedOptions = normalizeAllowedOptions(request.allowedOptions || []);
  if (allowedOptions.length === 0) {
    throw new Error("Type suggestions require the current accommodations type options.");
  }

  return {
    key: "type",
    label: "Type",
    kind: "single",
    options: allowedOptions,
  };
}

export function normalizeAllowedOptions(options: AccommodationsOption[]): AccommodationsOption[] {
  const seen = new Set<string>();
  return options
    .map((option) => ({
      value: String(option.value || "").trim(),
      label: String(option.label || option.value || "").trim(),
      description: String(option.description || "").trim(),
    }))
    .filter((option) => {
      if (!option.value || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
}

export function validateSuggestionValue(
  definition: AccommodationsSuggestionFieldDefinition,
  value: unknown
): string | string[] | null {
  if (definition.kind === "url") {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
    return trimmed;
  }

  const allowedValues = new Set((definition.options || []).map((option) => option.value));
  if (allowedValues.size === 0) return null;

  if (definition.kind === "multi") {
    if (!Array.isArray(value)) return null;
    const validated = value.filter(
      (item): item is string => typeof item === "string" && allowedValues.has(item)
    );
    const deduped = Array.from(new Set(validated));
    return deduped.length > 0 ? deduped : null;
  }

  if (typeof value !== "string") return null;
  return allowedValues.has(value) ? value : null;
}

export function normalizeAiResponse(
  fieldKey: AccommodationsSuggestionFieldKey,
  definition: AccommodationsSuggestionFieldDefinition,
  aiResponse: FieldSuggestionAiResponse
): AccommodationsFieldSuggestionResponse {
  const unknownKeys = Object.keys(aiResponse as unknown as Record<string, unknown>).filter(
    (key) => !["suggestion", "confidence", "reason", "sources"].includes(key)
  );
  const confidence = Number.isFinite(aiResponse.confidence)
    ? Math.max(0, Math.min(1, aiResponse.confidence))
    : 0;

  const validatedSuggestion = validateSuggestionValue(definition, aiResponse.suggestion);
  const base = {
    fieldKey,
    fieldLabel: definition.label,
    kind: definition.kind,
    confidence,
    reason: cleanReason(aiResponse.reason),
    sources: normalizeSources(aiResponse.sources),
    source: "ai" as const,
  };

  if (unknownKeys.length > 0) {
    return {
      ...base,
      suggestion: null,
      error: `AI response included unsupported keys: ${unknownKeys.join(", ")}.`,
    };
  }

  if (confidence < MIN_AI_CONFIDENCE) {
    return {
      ...base,
      suggestion: null,
      error: "AI confidence was too low to apply a suggestion.",
    };
  }

  if (!validatedSuggestion) {
    return {
      ...base,
      suggestion: null,
      error: "AI returned values outside the allowed options.",
    };
  }

  return {
    ...base,
    suggestion: validatedSuggestion,
  };
}

function buildExistingDataSuggestion(
  request: AccommodationsFieldSuggestionRequest,
  definition: AccommodationsSuggestionFieldDefinition
): AccommodationsFieldSuggestionResponse | null {
  const hints = request.apiContext?.accommodationsHints;
  const rawValue = (() => {
    switch (request.fieldKey) {
      case "price":
        return hints?.price || request.apiContext?.priceLevel;
      case "perfectFor":
        return hints?.perfectFor;
      case "ac":
        return hints?.ac;
      case "wifi":
        return hints?.wifi;
      case "parking":
        return hints?.parking;
      case "pool":
        return hints?.pool;
      default:
        return null;
    }
  })();

  const suggestion = validateSuggestionValue(definition, rawValue);
  if (!suggestion) return null;

  const sources = normalizeSources([
    {
      label: hints?.source === "foursquare" ? "Foursquare enrichment" : "Google prefill",
      url: request.apiContext?.googleUrl || undefined,
      snippet: hints?.foursquareId ? `Foursquare ID: ${hints.foursquareId}` : undefined,
    },
  ]);

  return {
    fieldKey: request.fieldKey,
    fieldLabel: definition.label,
    kind: definition.kind,
    suggestion,
    confidence: 0.9,
    reason: "Suggested from the existing Google/Foursquare prefill data for this accommodation.",
    sources,
    source: "existing-data",
  };
}

function buildAiRequest(
  request: AccommodationsFieldSuggestionRequest,
  definition: AccommodationsSuggestionFieldDefinition
): FieldSuggestionAiRequest {
  return {
    category: request.category,
    field_key: request.fieldKey,
    field_label: definition.label,
    kind: definition.kind,
    allowed_options: definition.options || [],
    form_values: request.formValues,
    api_context: { ...(request.apiContext || {}) },
  };
}

function cleanReason(value: unknown): string {
  if (typeof value !== "string") return "No usable evidence was returned.";
  const trimmed = value.trim();
  return trimmed || "No usable evidence was returned.";
}

function normalizeSources(value: unknown): AccommodationsSuggestionSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((source) => {
      if (!source || typeof source !== "object") return null;
      const record = source as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const url = typeof record.url === "string" ? record.url.trim() : "";
      const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
      if (!label && !url && !snippet) return null;

      return {
        label: label || url || "Evidence",
        ...(url ? { url } : {}),
        ...(snippet ? { snippet } : {}),
      };
    })
    .filter((source): source is AccommodationsSuggestionSource => source !== null)
    .slice(0, 5);
}
