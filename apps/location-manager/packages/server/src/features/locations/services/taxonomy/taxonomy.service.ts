import {
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

interface EnsureTaxonomyEntryOptions {
  autoApprove?: boolean;
}

export class TaxonomyService {
  /**
   * Ensure a locationKey exists in taxonomy, creating it as pending if needed
   * Returns true if entry already exists (approved or pending)
   */
  ensureTaxonomyEntry(
    locationKey: string,
    options: EnsureTaxonomyEntryOptions = {}
  ): boolean {
    if (!locationKey) return false;
    const shouldAutoApprove = options.autoApprove === true;

    // Check if already exists
    const existingEntry = getTaxonomyEntry(locationKey);
    if (existingEntry) {
      if (shouldAutoApprove && existingEntry.status === "pending") {
        return approveTaxonomyEntry(locationKey);
      }
      return true;
    }

    // Parse locationKey to extract components
    const parsed = parseLocationValue(locationKey);
    if (!parsed) {
      console.warn(`Invalid locationKey format: ${locationKey}`);
      return false;
    }

    // Insert as pending
    const inserted = insertPendingTaxonomyEntry(
      parsed.country,
      parsed.city,
      parsed.neighborhood,
      locationKey
    );

    if (!inserted) {
      const latestEntry = getTaxonomyEntry(locationKey);
      if (!latestEntry) return false;
      if (shouldAutoApprove && latestEntry.status === "pending") {
        return approveTaxonomyEntry(locationKey);
      }
      return true;
    }

    if (shouldAutoApprove) {
      return approveTaxonomyEntry(locationKey);
    }

    return true;
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
