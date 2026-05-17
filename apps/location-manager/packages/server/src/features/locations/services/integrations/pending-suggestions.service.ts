// Accept or dismiss a pendingSuggestions entry on a Location.
// On accept: write the suggestion's value to the live field with provenance =
// the suggestion's own provenance (ai-reviews / ai-google), then remove the entry.
// On dismiss: just remove the entry.

import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { getLocationByIdForUpdate } from "../../repositories/core/location-read.repository";
import { updateLocationById } from "../../repositories/core/location-write.repository";

type PendingField = "type" | "idealFor";

interface PendingEntry {
  value: string | string[];
  provenance: "ai-reviews" | "ai-google";
}

interface PendingMap {
  [field: string]: PendingEntry;
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
      if (entry.provenance !== "ai-reviews" && entry.provenance !== "ai-google") continue;
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
  return value === "type" || value === "idealFor";
}

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
}
