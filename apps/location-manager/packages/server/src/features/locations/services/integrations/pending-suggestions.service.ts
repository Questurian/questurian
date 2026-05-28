// Accept or dismiss a pendingSuggestions entry on a Location.
// On accept: write the suggestion's value to the live field with provenance =
// the suggestion's own provenance (ai), then remove the entry.
// On dismiss: just remove the entry.

import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { getLocationByIdForUpdate } from "../../repositories/core/location-read.repository";
import { updateLocationById } from "../../repositories/core/location-write.repository";

export type PendingField = "type" | "idealFor" | "bookingUrl";

export interface PendingEntry {
  value: string | string[];
  provenance: "ai";
}

export interface PendingMap {
  [field: string]: PendingEntry;
}

/** Mutates `pending` in place to add or replace an entry. */
export function setPendingEntry(
  pending: PendingMap,
  field: PendingField,
  value: string | string[],
): PendingMap {
  pending[field] = { value, provenance: "ai" };
  return pending;
}

function parsePending(json: string | null | undefined): PendingMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: PendingMap = {};
    for (const [key, raw] of Object.entries(parsed)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      if (entry.provenance !== "ai") continue;
      if (typeof entry.value !== "string" && !Array.isArray(entry.value)) continue;
      result[key] = entry as unknown as PendingEntry;
    }
    return result;
  } catch {
    return {};
  }
}

function parseProvenance(json: string | null | undefined): Record<string, string> {
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

function isPendingField(value: string): value is PendingField {
  return value === "type" || value === "idealFor" || value === "bookingUrl";
}

export { parsePending, parseProvenance };

export class PendingSuggestionsService {
  acceptOrDismiss(
    locationId: number,
    field: string,
    action: "accept" | "dismiss"
  ): { applied: "accept" | "dismiss"; remaining: PendingMap } {
    if (!isPendingField(field)) {
      throw new BadRequestError(`Unsupported pending field: ${field}`);
    }

    const location = getLocationByIdForUpdate(locationId);
    if (!location) {
      throw new NotFoundError(`Location ${locationId} not found`);
    }

    const pending = parsePending(location.pendingSuggestionsJson);
    const entry = pending[field];
    if (!entry) {
      throw new NotFoundError(`No pending suggestion for ${field}`);
    }

    const provenance = parseProvenance(location.provenanceJson);
    const updates: Parameters<typeof updateLocationById>[1] = {};

    if (action === "accept") {
      if (field === "type" && typeof entry.value === "string") {
        updates.type = entry.value;
        provenance.type = entry.provenance;
      } else if (field === "idealFor" && Array.isArray(entry.value)) {
        updates.idealForJson = JSON.stringify(entry.value);
        provenance.idealFor = entry.provenance;
      } else if (field === "bookingUrl" && typeof entry.value === "string") {
        updates.bookingUrl = entry.value;
        provenance.bookingUrl = entry.provenance;
      } else {
        throw new BadRequestError(`Pending value for ${field} has unexpected shape`);
      }
    }

    delete pending[field];

    updates.provenanceJson = Object.keys(provenance).length > 0 ? JSON.stringify(provenance) : null;
    updates.pendingSuggestionsJson =
      Object.keys(pending).length > 0 ? JSON.stringify(pending) : null;

    const ok = updateLocationById(locationId, updates);
    if (!ok) {
      throw new Error(`Failed to update location ${locationId}`);
    }

    return { applied: action, remaining: pending };
  }

  /**
   * Write an AI-suggested value to `pending_suggestions.<field>` without
   * touching the live field. Per ADR-0009 §6: edit-time AI suggestions surface
   * as Pending Suggestions; operator must Accept to apply.
   */
  proposePending(
    locationId: number,
    field: PendingField,
    value: string | string[],
  ): { pending: PendingMap } {
    const location = getLocationByIdForUpdate(locationId);
    if (!location) {
      throw new NotFoundError(`Location ${locationId} not found`);
    }

    const pending = parsePending(location.pendingSuggestionsJson);
    setPendingEntry(pending, field, value);

    const ok = updateLocationById(locationId, {
      pendingSuggestionsJson: JSON.stringify(pending),
    });
    if (!ok) {
      throw new Error(`Failed to update location ${locationId}`);
    }

    return { pending };
  }
}
