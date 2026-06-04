import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { getLocationById } from "../../repositories/core/location-read.repository";
import type { LocationCategory } from "../../models/location";
import { getPendingSuggestionsControllerDeps } from "../dependencies";

const { accommodationsField, diningField, pending } = getPendingSuggestionsControllerDeps();

const SUPPORTED_PROPOSE_CATEGORIES: ReadonlySet<LocationCategory> = new Set([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
]);

export async function postPendingSuggestionAccept(c: Context) {
  return resolve(c, "accept");
}

export async function postPendingSuggestionDismiss(c: Context) {
  return resolve(c, "dismiss");
}

/**
 * POST /api/locations/:id/pending-suggestions/propose
 * Body: { field: "bookingUrl" }
 *
 * Per ADR-0009: runs the field-suggestion AI for bookingUrl, writes the result
 * to pending_suggestions.bookingUrl. The operator then accepts or dismisses
 * through the existing accept/dismiss flow.
 */
export async function postPendingSuggestionPropose(c: Context) {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestError("Location id must be a positive integer");
  }

  const body = (await c.req.json().catch(() => ({}))) as { field?: unknown };
  if (body.field !== "bookingUrl") {
    throw new BadRequestError('Body must include { field: "bookingUrl" }');
  }

  const location = getLocationById(id);
  if (!location) {
    throw new NotFoundError(`Location ${id} not found`);
  }

  const category = location.category;
  if (!category || !SUPPORTED_PROPOSE_CATEGORIES.has(category)) {
    throw new BadRequestError(
      `Location category ${category ?? "(none)"} does not support bookingUrl suggestions`,
    );
  }
  const supportedCategory = category as "dining" | "accommodations" | "attractions" | "nightlife";

  const formValues = {
    name: location.name,
    address: location.address,
    bookingUrl: location.bookingUrl ?? "",
  } as Record<string, unknown>;

  const apiContext = {
    placeId: location.placeId,
    locationKey: location.locationKey,
    district: location.district,
    website: location.website,
  };

  const suggestion =
    supportedCategory === "accommodations"
      ? await accommodationsField.suggestField({
          category: "accommodations",
          fieldKey: "bookingUrl",
          formValues,
          apiContext,
        })
      : await diningField.suggestField({
          fieldKey: "bookingUrl",
          category: supportedCategory,
          formValues,
          apiContext,
        });

  if (!suggestion.suggestion || typeof suggestion.suggestion !== "string") {
    return c.json(
      errorResponse(suggestion.error || "AI did not return a usable booking URL."),
      502,
    );
  }

  const result = pending.proposePending(
    id,
    "bookingUrl",
    suggestion.suggestion,
  );

  return c.json(
    successResponse({
      ...result,
      suggestion: {
        value: suggestion.suggestion,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        sources: suggestion.sources,
      },
    }),
  );
}

async function resolve(c: Context, action: "accept" | "dismiss") {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestError("Location id must be a positive integer");
  }
  const body = (await c.req.json().catch(() => ({}))) as { field?: unknown };
  if (typeof body.field !== "string" || body.field.length === 0) {
    throw new BadRequestError("Body must include a `field` string");
  }
  const result = pending.acceptOrDismiss(id, body.field, action);
  return c.json(successResponse(result));
}
