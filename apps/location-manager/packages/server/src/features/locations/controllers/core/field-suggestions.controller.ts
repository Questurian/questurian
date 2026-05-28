import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { errorResponse, successResponse } from "@shared/types/api-response";
import type { FieldSuggestionDto } from "../../validation/schemas/maps.schemas";
import type {
  AccommodationsFieldSuggestionRequest,
} from "../../services/integrations/accommodations-field-suggestion.service";
import type { DiningSuggestionFieldKey } from "../../services/integrations/dining-field-suggestion.service";

const container = ServiceContainer.getInstance();
const AI_TIMEOUT_MS = 60000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Field suggestion timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export async function postFieldSuggestion(c: Context) {
  const dto = c.get("validatedBody") as FieldSuggestionDto;

  try {
    if (dto.category === "dining") {
      const suggestion = await withTimeout(
        container.diningFieldSuggestionService.suggestField({
          fieldKey: dto.fieldKey as DiningSuggestionFieldKey,
          formValues: dto.formValues,
          apiContext: dto.apiContext as Record<string, unknown> | undefined,
        }),
        AI_TIMEOUT_MS
      );
      return c.json(successResponse(suggestion));
    }

    // Per ADR-0009: attractions/nightlife support bookingUrl only. The dining
    // service accepts a category override so the AI request lands with the
    // correct grounded-search context.
    if (dto.category === "attractions" || dto.category === "nightlife") {
      const suggestion = await withTimeout(
        container.diningFieldSuggestionService.suggestField({
          fieldKey: "bookingUrl",
          category: dto.category,
          formValues: dto.formValues,
          apiContext: dto.apiContext as Record<string, unknown> | undefined,
        }),
        AI_TIMEOUT_MS
      );
      return c.json(successResponse(suggestion));
    }

    const suggestion = await withTimeout(
      container.accommodationsFieldSuggestionService.suggestField(
        dto as AccommodationsFieldSuggestionRequest
      ),
      AI_TIMEOUT_MS
    );
    return c.json(successResponse(suggestion));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate field suggestion";

    console.error("[FieldSuggestions] Failed", {
      category: dto.category,
      locationId: dto.locationId,
      fieldKey: dto.fieldKey,
      error: message,
    });

    return c.json(errorResponse(message), 502);
  }
}
