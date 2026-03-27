#!/usr/bin/env bun

import type { Database } from "bun:sqlite";
import { getIdealForTags } from "@shared/types/location-ideal-for";

interface NightlifeIdealForRow {
  entityId: number;
  name: string;
  idealForJson: string | null;
  nightlifeDetailsJson: string | null;
}

export interface ClearInvalidNightlifeIdealForResult {
  scanned: number;
  cleared: number;
  rows: NightlifeIdealForRow[];
}

const NIGHTLIFE_ALLOWED_TAGS: ReadonlySet<string> = new Set(getIdealForTags("nightlife"));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasInvalidNightlifeIdealForTag(idealForJson: string | null): boolean {
  if (!idealForJson || idealForJson.trim().length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(idealForJson);
    if (!Array.isArray(parsed)) {
      return true;
    }

    return parsed.some((tag) => {
      if (typeof tag !== "string") {
        return true;
      }

      const normalizedTag = tag.trim();
      return normalizedTag.length === 0 || !NIGHTLIFE_ALLOWED_TAGS.has(normalizedTag);
    });
  } catch {
    return true;
  }
}

function stripNestedNightlifeIdealFor(
  nightlifeDetailsJson: string | null
): { nextNightlifeDetailsJson: string | null; strippedNested: boolean } {
  if (!nightlifeDetailsJson) {
    return {
      nextNightlifeDetailsJson: nightlifeDetailsJson,
      strippedNested: false,
    };
  }

  try {
    const parsed = JSON.parse(nightlifeDetailsJson);
    const root = asRecord(parsed);
    const core = asRecord(root?.core);

    if (!root || !core || !Object.prototype.hasOwnProperty.call(core, "idealFor")) {
      return {
        nextNightlifeDetailsJson: nightlifeDetailsJson,
        strippedNested: false,
      };
    }

    const nextCore = { ...core };
    delete nextCore.idealFor;

    return {
      nextNightlifeDetailsJson: JSON.stringify({
        ...root,
        core: nextCore,
      }),
      strippedNested: true,
    };
  } catch {
    return {
      nextNightlifeDetailsJson: nightlifeDetailsJson,
      strippedNested: false,
    };
  }
}

interface NightlifeIdealForUpdate extends NightlifeIdealForRow {
  nextIdealForJson: string | null;
  nextNightlifeDetailsJson: string | null;
  clearedTopLevel: boolean;
  strippedNested: boolean;
}

function buildNightlifeIdealForUpdate(
  row: NightlifeIdealForRow
): NightlifeIdealForUpdate | null {
  const clearedTopLevel = hasInvalidNightlifeIdealForTag(row.idealForJson);
  const { nextNightlifeDetailsJson, strippedNested } = stripNestedNightlifeIdealFor(
    row.nightlifeDetailsJson
  );

  if (!clearedTopLevel && !strippedNested) {
    return null;
  }

  return {
    ...row,
    nextIdealForJson: clearedTopLevel ? null : row.idealForJson,
    nextNightlifeDetailsJson,
    clearedTopLevel,
    strippedNested,
  };
}

export function findInvalidNightlifeIdealForRows(db: Database): NightlifeIdealForUpdate[] {
  const rows = db.query(`
    SELECT
      n.entity_id AS entityId,
      e.name AS name,
      n.ideal_for_json AS idealForJson,
      n.nightlife_details_json AS nightlifeDetailsJson
    FROM nightlife_locations n
    INNER JOIN entities e ON e.id = n.entity_id
  `).all() as NightlifeIdealForRow[];

  return rows
    .map((row) => buildNightlifeIdealForUpdate(row))
    .filter((row): row is NightlifeIdealForUpdate => row !== null);
}

export function clearInvalidNightlifeIdealFor(
  db: Database
): ClearInvalidNightlifeIdealForResult {
  const rowsToClear = findInvalidNightlifeIdealForRows(db);
  const scanned = db.query(`
    SELECT COUNT(*) AS count
    FROM nightlife_locations
    WHERE (ideal_for_json IS NOT NULL AND TRIM(ideal_for_json) != '')
       OR (nightlife_details_json IS NOT NULL AND TRIM(nightlife_details_json) != '')
  `).get() as { count: number };

  if (rowsToClear.length === 0) {
    return {
      scanned: scanned.count,
      cleared: 0,
      rows: [],
    };
  }

  const clearStatement = db.query(`
    UPDATE nightlife_locations
    SET ideal_for_json = ?,
        nightlife_details_json = ?
    WHERE entity_id = ?
  `);

  const clearTransaction = db.transaction((rows: NightlifeIdealForUpdate[]) => {
    rows.forEach((row) => {
      clearStatement.run(row.nextIdealForJson, row.nextNightlifeDetailsJson, row.entityId);
    });
  });

  clearTransaction(rowsToClear);

  return {
    scanned: scanned.count,
    cleared: rowsToClear.length,
    rows: rowsToClear,
  };
}

async function main() {
  const { getDb } = await import("../client");
  const db = getDb();
  const result = clearInvalidNightlifeIdealFor(db);

  console.log("🔧 Nightlife Ideal For cleanup");
  console.log(`   Scanned: ${result.scanned}`);
  console.log(`   Cleared: ${result.cleared}`);

  if (result.rows.length > 0) {
    console.log("");
    console.log("   Cleared rows:");
    result.rows.forEach((row) => {
      console.log(`   - #${row.entityId} ${row.name}: ${row.idealForJson}`);
    });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Failed to clear invalid nightlife Ideal For tags:", error);
    process.exit(1);
  });
}
