// Dining field suggestions — invoked pre-Create by the Add Dining autofill
// flow (ADR-0008) for `idealFor`, `type`, `menuUrl`, and `reservationUrl`.
//
// Does not require a Location row. Accepts the operator's in-flight form
// values plus the Google/TripAdvisor prefill context, calls python
// `/field-suggestion`, applies confidence + (for URLs) scheme validation, and
// returns the suggestion. The client decides whether to apply it to the form.

import { DINING_ESTABLISHMENT_TYPES } from "@shared/types/dining-taxonomy";
import { DINING_IDEAL_FOR_TAGS } from "@shared/types/location-ideal-for";
import type {
  AltTextApiClient,
  FieldSuggestionAiRequest,
  FieldSuggestionAiResponse,
} from "./clients/alt-text-api.client";

export const DINING_SUGGESTION_FIELD_KEYS = [
  "type",
  "idealFor",
  "menuUrl",
  "reservationUrl",
] as const;
export type DiningSuggestionFieldKey = (typeof DINING_SUGGESTION_FIELD_KEYS)[number];

const MIN_AI_CONFIDENCE = 0.6;

export interface DiningFieldSuggestionApiContext {
  placeId?: string | null;
  locationKey?: string | null;
  district?: string | null;
  priceLevel?: string | null;
  website?: string | null;
  tripadvisorUrl?: string | null;
  tripadvisorMealTypes?: string[] | null;
  tripadvisorCuisines?: string[] | null;
  tripadvisorFeatures?: string[] | null;
}

export interface DiningFieldSuggestionRequest {
  fieldKey: DiningSuggestionFieldKey;
  formValues: Record<string, unknown>;
  apiContext?: DiningFieldSuggestionApiContext;
}

export interface DiningSuggestionSource {
  label: string;
  url?: string;
  snippet?: string;
}

export interface DiningFieldSuggestionResponse {
  fieldKey: DiningSuggestionFieldKey;
  fieldLabel: string;
  kind: "single" | "multi" | "url";
  suggestion: string | string[] | null;
  confidence: number;
  reason: string;
  sources: DiningSuggestionSource[];
  error?: string;
}

export class DiningFieldSuggestionService {
  constructor(private readonly aiClient: AltTextApiClient) {}

  async suggestField(
    request: DiningFieldSuggestionRequest
  ): Promise<DiningFieldSuggestionResponse> {
    const aiRequest = buildAiRequest(request);

    let aiResponse: FieldSuggestionAiResponse;
    try {
      aiResponse = await this.aiClient.suggestField(aiRequest);
    } catch (error) {
      return {
        fieldKey: request.fieldKey,
        fieldLabel: aiRequest.field_label,
        kind: aiRequest.kind,
        suggestion: null,
        confidence: 0,
        reason: "",
        sources: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const confidence = Number.isFinite(aiResponse.confidence)
      ? Math.max(0, Math.min(1, aiResponse.confidence))
      : 0;
    const sources: DiningSuggestionSource[] = (aiResponse.sources ?? []).map(
      (source) => ({
        label: source.label ?? source.url ?? "",
        url: source.url,
        snippet: source.snippet,
      })
    );

    const suggestion = validateSuggestion(request.fieldKey, aiResponse.suggestion);

    return {
      fieldKey: request.fieldKey,
      fieldLabel: aiRequest.field_label,
      kind: aiRequest.kind,
      suggestion: suggestion === null || confidence < MIN_AI_CONFIDENCE ? null : suggestion,
      confidence,
      reason: typeof aiResponse.reason === "string" ? aiResponse.reason : "",
      sources,
    };
  }
}

function buildAiRequest(request: DiningFieldSuggestionRequest): FieldSuggestionAiRequest {
  const baseContext: Record<string, unknown> = {
    placeId: request.apiContext?.placeId ?? null,
    locationKey: request.apiContext?.locationKey ?? null,
    district: request.apiContext?.district ?? null,
    priceLevel: request.apiContext?.priceLevel ?? null,
    website: request.apiContext?.website ?? null,
    tripadvisorUrl: request.apiContext?.tripadvisorUrl ?? null,
    tripadvisorMealTypes: request.apiContext?.tripadvisorMealTypes ?? null,
    tripadvisorCuisines: request.apiContext?.tripadvisorCuisines ?? null,
    tripadvisorFeatures: request.apiContext?.tripadvisorFeatures ?? null,
  };

  switch (request.fieldKey) {
    case "type":
      return {
        category: "dining",
        field_key: "type",
        field_label: "Type",
        kind: "single",
        allowed_options: DINING_ESTABLISHMENT_TYPES.map((option) => ({
          value: option.value,
          label: option.label,
          description: "",
        })),
        form_values: request.formValues,
        api_context: baseContext,
      };
    case "idealFor":
      return {
        category: "dining",
        field_key: "idealFor",
        field_label: "Ideal For",
        kind: "multi",
        allowed_options: DINING_IDEAL_FOR_TAGS.map((tag) => ({
          value: tag,
          label: tag,
          description: "",
        })),
        form_values: request.formValues,
        api_context: baseContext,
      };
    case "menuUrl":
      return {
        category: "dining",
        field_key: "menuUrl",
        field_label: "Menu",
        kind: "url",
        form_values: request.formValues,
        api_context: baseContext,
      };
    case "reservationUrl":
      return {
        category: "dining",
        field_key: "reservationUrl",
        field_label: "Reservation",
        kind: "url",
        form_values: request.formValues,
        api_context: baseContext,
      };
    default: {
      const exhaustive: never = request.fieldKey;
      throw new Error(`Unknown dining suggestion field: ${String(exhaustive)}`);
    }
  }
}

function validateSuggestion(
  fieldKey: DiningSuggestionFieldKey,
  value: unknown
): string | string[] | null {
  if (value === null || value === undefined) return null;

  if (fieldKey === "type") {
    if (typeof value !== "string") return null;
    return DINING_ESTABLISHMENT_TYPES.some((option) => option.value === value)
      ? value
      : null;
  }

  if (fieldKey === "idealFor") {
    if (!Array.isArray(value)) return null;
    const allowed = new Set<string>(DINING_IDEAL_FOR_TAGS as readonly string[]);
    const filtered = value.filter(
      (item): item is string => typeof item === "string" && allowed.has(item)
    );
    const deduped = Array.from(new Set(filtered)).slice(0, 4);
    return deduped.length > 0 ? deduped : null;
  }

  if (fieldKey === "menuUrl" || fieldKey === "reservationUrl") {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return null;
    }
    return trimmed;
  }

  return null;
}
