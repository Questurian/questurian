import {
  getAllCorrections,
  findCorrection,
  insertCorrection,
  deleteCorrection,
  getCorrectionById,
  findAffectedPendingTaxonomy,
  countAffectedLocations,
  findAffectedLocationSamples,
  type TaxonomyCorrection,
} from "../../repositories/taxonomy";
import {
  deduplicatePendingTaxonomy,
  bulkUpdatePendingTaxonomy,
} from "../../repositories/taxonomy";
import { bulkUpdateLocationKeys } from "../../repositories/core";
import { getDb } from "@server/shared/db/client";
import { parseLocationValue } from "../../utils/location-utils";
import {
  BadRequestError,
  NotFoundError,
} from "@server/shared/core/errors/http-error";

export class TaxonomyCorrectionService {
  /**
   * Apply corrections to a locationKey string
   * Example: "brazil|bras-lia|asa-sul" -> "brazil|brasilia|asa-sul"
   */
  applyCorrections(locationKey: string): string {
    if (!locationKey) return locationKey;

    const parsed = parseLocationValue(locationKey);
    if (!parsed) return locationKey;

    // Apply corrections to each part
    const correctedCountry = this.applyCorrectionToPart(
      parsed.country,
      "country"
    );
    const correctedCity = parsed.city
      ? this.applyCorrectionToPart(parsed.city, "city")
      : null;
    const correctedNeighborhood = parsed.neighborhood
      ? this.applyCorrectionToPart(parsed.neighborhood, "neighborhood")
      : null;

    // Rebuild locationKey
    const parts = [
      correctedCountry,
      correctedCity,
      correctedNeighborhood,
    ].filter(Boolean);
    return parts.join("|");
  }

  /**
   * Apply correction to a single location part
   */
  private applyCorrectionToPart(
    value: string,
    partType: "country" | "city" | "neighborhood"
  ): string {
    const correction = findCorrection(value, partType);
    return correction ? correction.correct_value : value;
  }

  /**
   * Get all correction rules
   */
  getAllRules(): TaxonomyCorrection[] {
    return getAllCorrections();
  }

  /**
   * Preview the impact of creating a correction rule
   * Shows how many pending taxonomy entries and locations would be affected
   */
  previewCorrection(
    incorrectValue: string,
    correctValue: string,
    partType: "country" | "city" | "neighborhood"
  ): {
    pendingTaxonomyCount: number;
    pendingTaxonomySamples: string[];
    locationCount: number;
    locationSamples: Array<{
      id: number;
      name: string;
      currentKey: string;
      correctedKey: string;
    }>;
  } {
    // Validate inputs (same as addRule)
    if (!incorrectValue || !correctValue) {
      throw new BadRequestError(
        "Both incorrect_value and correct_value are required"
      );
    }

    if (incorrectValue === correctValue) {
      throw new BadRequestError(
        "Incorrect and correct values cannot be the same"
      );
    }

    // Find affected pending taxonomy entries
    const affectedPending = findAffectedPendingTaxonomy(
      incorrectValue,
      partType
    );

    // Count total affected locations
    const locationCount = countAffectedLocations(incorrectValue, partType);

    // Get sample locations with before/after
    const locationSamples = findAffectedLocationSamples(
      incorrectValue,
      correctValue,
      partType
    );

    return {
      pendingTaxonomyCount: affectedPending.length,
      pendingTaxonomySamples: affectedPending.map((entry) => entry.locationKey),
      locationCount,
      locationSamples,
    };
  }

  /**
   * Add a new correction rule and retroactively apply it to existing data
   */
  addRule(
    incorrectValue: string,
    correctValue: string,
    partType: "country" | "city" | "neighborhood"
  ): {
    correction: TaxonomyCorrection;
    updatedPendingCount: number;
    updatedLocationCount: number;
  } {
    // Validate inputs
    if (!incorrectValue || !correctValue) {
      throw new BadRequestError(
        "Both incorrect_value and correct_value are required"
      );
    }

    if (incorrectValue === correctValue) {
      throw new BadRequestError(
        "Incorrect and correct values cannot be the same"
      );
    }

    const db = getDb();

    try {
      // Begin transaction
      db.run("BEGIN TRANSACTION");

      // 1. Insert correction rule
      const inserted = insertCorrection(incorrectValue, correctValue, partType);
      if (!inserted) {
        throw new BadRequestError(
          "Failed to create correction rule (may already exist)"
        );
      }

      // 2. Deduplicate pending entries (prevent UNIQUE constraint violation)
      deduplicatePendingTaxonomy(incorrectValue, correctValue, partType);

      // 3. Bulk update pending taxonomy entries
      const pendingCount = bulkUpdatePendingTaxonomy(
        incorrectValue,
        correctValue,
        partType
      );

      // 4. Bulk update location records
      const locationCount = bulkUpdateLocationKeys(
        incorrectValue,
        correctValue,
        partType
      );

      // Commit transaction
      db.run("COMMIT");

      return {
        correction: inserted,
        updatedPendingCount: pendingCount,
        updatedLocationCount: locationCount,
      };
    } catch (error) {
      // Rollback on error
      db.run("ROLLBACK");
      throw error;
    }
  }

  /**
   * Remove a correction rule
   */
  removeRule(id: number): void {
    const exists = getCorrectionById(id);
    if (!exists) {
      throw new NotFoundError("Correction rule", id);
    }

    const success = deleteCorrection(id);
    if (!success) {
      throw new BadRequestError("Failed to delete correction rule");
    }
  }
}
