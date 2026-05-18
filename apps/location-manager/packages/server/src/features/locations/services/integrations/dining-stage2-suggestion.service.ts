// Stage 2 of the Add Dining auto-fill pipeline (per ADR-0002, updated by ADR-0005).
//
// Calls python /field-suggestion once per AI-eligible dining field (currently:
// `type`, `idealFor`) using grounded Google Search as the evidence source, then
// routes each result either into the live Location value (with provenance set to
// `ai`) or into the `pendingSuggestions` side channel — depending on whether the
// operator has touched the field since Stage 1.
//
// Decision rule per field:
//   - If the live field is empty, OR the existing provenance entry indicates the
//     value is still pipeline-owned (google/tripadvisor/scraper/ai), the AI
//     suggestion is written to the live field and provenance is updated.
//   - Otherwise (operator edited the field, dropping provenance), the suggestion
//     lands in `pendingSuggestions[<field>]` for review on the edit page.
//
// Title polish is deferred — it requires a free-text endpoint that doesn't fit
// the option-constrained /field-suggestion shape.

import { DINING_ESTABLISHMENT_TYPES } from "@shared/types/dining-taxonomy";
import { DINING_IDEAL_FOR_TAGS } from "@shared/types/location-ideal-for";
import { getLocationByIdForUpdate } from "../../repositories/core/location-read.repository";
import { updateLocationById } from "../../repositories/core/location-write.repository";
import type {
  AltTextApiClient,
  FieldSuggestionAiRequest,
  FieldSuggestionAiResponse,
} from "./clients/alt-text-api.client";

const MIN_AI_CONFIDENCE = 0.6;

type DiningStage2Field = "type" | "idealFor";

type ResolvedProvenanceSource = "ai";

interface FieldOutcome {
  field: DiningStage2Field;
  applied: "live" | "pending" | "skipped";
  reason?: string;
  value?: string | string[];
  provenance?: ResolvedProvenanceSource;
  confidence?: number;
}

export interface DiningStage2Result {
  locationId: number;
  outcomes: FieldOutcome[];
}

export class DiningStage2SuggestionService {
  constructor(private readonly aiClient: AltTextApiClient) {}

  async runStage2(locationId: number): Promise<DiningStage2Result> {
    const location = getLocationByIdForUpdate(locationId);
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }
    if (location.category !== "dining") {
      throw new Error(`Stage 2 dining suggestion only applies to dining locations (got ${location.category})`);
    }

    const provenance = parseStringMap(location.provenanceJson);
    const pending = parsePendingSuggestions(location.pendingSuggestionsJson);
    const provenanceSource: ResolvedProvenanceSource = "ai";

    const currentIdealFor = parseStringArray(location.idealForJson);
    const formValues = {
      name: location.name,
      title: location.title ?? "",
      type: location.type ?? "",
      idealFor: currentIdealFor,
      address: location.address,
      district: location.district ?? "",
    };

    const outcomes: FieldOutcome[] = [];

    outcomes.push(
      await this.runField({
        field: "type",
        currentValue: location.type ?? null,
        currentValueIsEmpty: !location.type,
        provenanceEntryExists: typeof provenance.type === "string",
        aiRequest: {
          category: "dining",
          field_key: "type",
          field_label: "Type",
          kind: "single",
          allowed_options: DINING_ESTABLISHMENT_TYPES.map((option) => ({
            value: option.value,
            label: option.label,
            description: "",
          })),
          form_values: formValues,
          api_context: {
            placeId: location.placeId ?? null,
            locationKey: location.locationKey ?? null,
            district: location.district ?? null,
            priceLevel: location.priceLevel ?? null,
          },
        },
        validate: (value) =>
          typeof value === "string" &&
          DINING_ESTABLISHMENT_TYPES.some((option) => option.value === value)
            ? value
            : null,
        applyLive: (validatedValue) => {
          provenance.type = provenanceSource;
          return { type: validatedValue };
        },
        landPending: (validatedValue) => {
          pending.type = { value: validatedValue, provenance: provenanceSource };
        },
        provenanceSource,
      })
    );

    outcomes.push(
      await this.runField({
        field: "idealFor",
        currentValue: currentIdealFor,
        currentValueIsEmpty: currentIdealFor.length === 0,
        provenanceEntryExists: typeof provenance.idealFor === "string",
        aiRequest: {
          category: "dining",
          field_key: "idealFor",
          field_label: "Ideal For",
          kind: "multi",
          allowed_options: DINING_IDEAL_FOR_TAGS.map((tag) => ({
            value: tag,
            label: tag,
            description: "",
          })),
          form_values: formValues,
          api_context: {
            placeId: location.placeId ?? null,
            locationKey: location.locationKey ?? null,
            district: location.district ?? null,
            priceLevel: location.priceLevel ?? null,
          },
        },
        validate: (value) => {
          if (!Array.isArray(value)) return null;
          const allowed = new Set<string>(DINING_IDEAL_FOR_TAGS as readonly string[]);
          const filtered = value.filter(
            (item): item is string => typeof item === "string" && allowed.has(item)
          );
          const deduped = Array.from(new Set(filtered)).slice(0, 4);
          return deduped.length > 0 ? deduped : null;
        },
        applyLive: (validatedValue) => {
          provenance.idealFor = provenanceSource;
          return { idealForJson: JSON.stringify(validatedValue) };
        },
        landPending: (validatedValue) => {
          pending.idealFor = { value: validatedValue, provenance: provenanceSource };
        },
        provenanceSource,
      })
    );

    const persistedChanges: Partial<{
      type: string | null;
      idealForJson: string | null;
    }> = {};

    for (const outcome of outcomes) {
      if (outcome.applied !== "live" || !outcome.value) continue;
      if (outcome.field === "type" && typeof outcome.value === "string") {
        persistedChanges.type = outcome.value;
      }
      if (outcome.field === "idealFor" && Array.isArray(outcome.value)) {
        persistedChanges.idealForJson = JSON.stringify(outcome.value);
      }
    }

    updateLocationById(locationId, {
      ...persistedChanges,
      provenanceJson: Object.keys(provenance).length > 0 ? JSON.stringify(provenance) : null,
      pendingSuggestionsJson:
        Object.keys(pending).length > 0 ? JSON.stringify(pending) : null,
    });

    return {
      locationId,
      outcomes,
    };
  }

  private async runField<T extends string | string[]>(args: {
    field: DiningStage2Field;
    currentValue: T | string | string[] | null;
    currentValueIsEmpty: boolean;
    provenanceEntryExists: boolean;
    aiRequest: FieldSuggestionAiRequest;
    validate: (value: unknown) => T | null;
    applyLive: (validatedValue: T) => Record<string, unknown>;
    landPending: (validatedValue: T) => void;
    provenanceSource: ResolvedProvenanceSource;
  }): Promise<FieldOutcome> {
    let aiResponse: FieldSuggestionAiResponse;
    try {
      aiResponse = await this.aiClient.suggestField(args.aiRequest);
    } catch (error) {
      return {
        field: args.field,
        applied: "skipped",
        reason: `AI call failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const confidence = Number.isFinite(aiResponse.confidence)
      ? Math.max(0, Math.min(1, aiResponse.confidence))
      : 0;
    if (confidence < MIN_AI_CONFIDENCE) {
      return { field: args.field, applied: "skipped", reason: "Confidence below threshold", confidence };
    }

    const validated = args.validate(aiResponse.suggestion);
    if (validated == null) {
      return { field: args.field, applied: "skipped", reason: "AI returned invalid values", confidence };
    }

    const canWriteLive = args.currentValueIsEmpty || args.provenanceEntryExists;
    if (canWriteLive) {
      args.applyLive(validated);
      return {
        field: args.field,
        applied: "live",
        value: validated,
        provenance: args.provenanceSource,
        confidence,
      };
    }

    args.landPending(validated);
    return {
      field: args.field,
      applied: "pending",
      value: validated,
      provenance: args.provenanceSource,
      confidence,
    };
  }
}

function parseStringMap(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

interface PendingSuggestionEntry {
  value: string | string[];
  provenance: ResolvedProvenanceSource;
}

function parsePendingSuggestions(
  json: string | null | undefined
): Record<string, PendingSuggestionEntry> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, PendingSuggestionEntry> = {};
    for (const [key, raw] of Object.entries(parsed)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      const provenance = entry.provenance;
      const value = entry.value;
      if (provenance !== "ai") continue;
      if (typeof value === "string" || Array.isArray(value)) {
        result[key] = { value: value as string | string[], provenance };
      }
    }
    return result;
  } catch {
    return {};
  }
}
