import type { Database } from "bun:sqlite";
import {
  getAllCorrections,
  findCorrection,
  insertCorrection,
  deleteCorrection,
  getCorrectionById,
  findAffectedPendingTaxonomy,
  countAffectedLocations,
  findAffectedLocationSamples,
  deduplicatePendingTaxonomy,
  bulkUpdatePendingTaxonomy,
  bulkUpdateLocationKeys,
  type TaxonomyCorrection,
} from "../../repositories/taxonomy/taxonomy-correction";
import { getDb } from "@server/shared/db/client";
import { parseLocationValue } from "../../utils/location-utils";
import {
  BadRequestError,
  NotFoundError,
} from "@server/shared/core/errors/http-error";

export class TaxonomyCorrectionService {
  constructor(private readonly database?: Database) {}

  private get db(): Database {
    return this.database ?? getDb();
  }

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
    const correction = findCorrection(value, partType, this.db);
    return correction ? correction.correct_value : value;
  }

  /**
   * Get all correction rules
   */
  getAllRules(): TaxonomyCorrection[] {
    return getAllCorrections(this.db);
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
    this.validateRuleValues(incorrectValue, correctValue);

    // Find affected pending taxonomy entries
    const affectedPending = findAffectedPendingTaxonomy(
      incorrectValue,
      partType,
      this.db
    );

    // Count total affected locations
    const locationCount = countAffectedLocations(
      incorrectValue,
      partType,
      this.db
    );

    // Get sample locations with before/after
    const locationSamples = findAffectedLocationSamples(
      incorrectValue,
      correctValue,
      partType,
      this.db
    );

    return {
      pendingTaxonomyCount: affectedPending.length,
      pendingTaxonomySamples: affectedPending.map((entry) => entry.locationKey),
      locationCount,
      locationSamples,
    };
  }

  /**
   * Add a new correction rule and retroactively apply it to existing data.
   * Runs in one transaction: an applied rule must update all matching rows
   * (pending taxonomy + entities), or none.
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
    this.validateRuleValues(incorrectValue, correctValue);

    const db = this.db;

    try {
      // Begin transaction
      db.run("BEGIN TRANSACTION");

      // 1. Insert correction rule
      const inserted = insertCorrection(
        incorrectValue,
        correctValue,
        partType,
        db
      );
      if (!inserted) {
        throw new BadRequestError(
          "Failed to create correction rule (may already exist)"
        );
      }

      // 2. Deduplicate pending entries (prevent UNIQUE constraint violation)
      deduplicatePendingTaxonomy(incorrectValue, correctValue, partType, db);

      // 3. Bulk update pending taxonomy entries
      const pendingCount = bulkUpdatePendingTaxonomy(
        incorrectValue,
        correctValue,
        partType,
        db
      );

      // 4. Bulk update location records
      const locationCount = bulkUpdateLocationKeys(
        incorrectValue,
        correctValue,
        partType,
        db
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
    const exists = getCorrectionById(id, this.db);
    if (!exists) {
      throw new NotFoundError("Correction rule", id);
    }

    const success = deleteCorrection(id, this.db);
    if (!success) {
      throw new BadRequestError("Failed to delete correction rule");
    }
  }

  private validateRuleValues(
    incorrectValue: string,
    correctValue: string
  ): void {
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
  }
}
