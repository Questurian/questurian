import {
  taxonomyEntryExists,
  getTaxonomyEntry,
  insertPendingTaxonomyEntry,
  approveTaxonomyEntry,
  rejectTaxonomyEntry,
  getPendingTaxonomyEntries,
  getLocationCountByTaxonomy
} from "../../repositories/taxonomy";
import { parseLocationValue } from "../../utils/location-utils";
import { NotFoundError, BadRequestError } from "@server/shared/core/errors/http-error";
import type { LocationHierarchy } from "../../models/location";

export interface PendingTaxonomyEntryWithCount extends LocationHierarchy {
  locationCount: number;
}

export class TaxonomyService {
  /**
   * Ensure a locationKey exists in taxonomy, creating it as pending if needed
   * Returns true if entry already exists (approved or pending)
   */
  ensureTaxonomyEntry(locationKey: string): boolean {
    if (!locationKey) return false;

    // Check if already exists
    if (taxonomyEntryExists(locationKey)) {
      return true;
    }

    // Parse locationKey to extract components
    const parsed = parseLocationValue(locationKey);
    if (!parsed) {
      console.warn(`Invalid locationKey format: ${locationKey}`);
      return false;
    }

    // Insert as pending
    return insertPendingTaxonomyEntry(
      parsed.country,
      parsed.city,
      parsed.neighborhood,
      locationKey
    );
  }

  /**
   * Get all pending taxonomy entries with location counts
   */
  getPendingEntries(): PendingTaxonomyEntryWithCount[] {
    const pending = getPendingTaxonomyEntries();

    return pending.map(entry => ({
      ...entry,
      locationCount: getLocationCountByTaxonomy(entry.locationKey)
    }));
  }

  /**
   * Approve a pending taxonomy entry
   */
  approve(locationKey: string): LocationHierarchy {
    const entry = getTaxonomyEntry(locationKey);
    if (!entry) {
      throw new NotFoundError("Taxonomy entry", locationKey);
    }

    if (entry.status === 'approved') {
      throw new BadRequestError("Taxonomy entry is already approved");
    }

    const success = approveTaxonomyEntry(locationKey);
    if (!success) {
      throw new BadRequestError("Failed to approve taxonomy entry");
    }

    const updated = getTaxonomyEntry(locationKey);
    if (!updated) {
      throw new NotFoundError("Taxonomy entry", locationKey);
    }

    return updated;
  }

  /**
   * Reject (delete) a pending taxonomy entry
   */
  reject(locationKey: string): void {
    const entry = getTaxonomyEntry(locationKey);
    if (!entry) {
      throw new NotFoundError("Taxonomy entry", locationKey);
    }

    if (entry.status === 'approved') {
      throw new BadRequestError("Cannot reject an approved taxonomy entry");
    }

    const success = rejectTaxonomyEntry(locationKey);
    if (!success) {
      throw new BadRequestError("Failed to reject taxonomy entry");
    }
  }
}
