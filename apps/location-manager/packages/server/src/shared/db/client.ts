import { Database } from "bun:sqlite";
import { join, dirname, isAbsolute, resolve } from "path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "url";
import { splitLocationsToEntities } from "./migrations/split-locations-to-entities";
import { clearInvalidNightlifeIdealFor } from "./migrations/clear-invalid-nightlife-ideal-for";
import { addEntityProvenance } from "./migrations/add-entity-provenance";
import { addEntityPendingSuggestions } from "./migrations/add-entity-pending-suggestions";
import { collapseAiProvenance } from "./migrations/collapse-ai-provenance";
import { dropReviewPipelineSchema } from "./migrations/drop-review-pipeline-schema";
import { addPhotoImportFields } from "./migrations/add-photo-import-fields";
import { renameReservationUrlToBookingUrl } from "./migrations/rename-reservation-url-to-booking-url";
import { addAppSettings } from "./migrations/add-app-settings";
import { addEntityPhoneUnavailable } from "./migrations/add-entity-phone-unavailable";

let db: Database | null = null;
let dbPathUsed: string | null = null;

function resolveDbPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(currentDir, "../../../");
  const repoRoot = resolve(currentDir, "../../../../..");
  const defaultDbPath = join(serverRoot, "data/location.sqlite");
  const rawPath = process.env.DB_PATH;

  if (!rawPath) {
    return defaultDbPath;
  }

  if (isAbsolute(rawPath)) {
    return rawPath;
  }

  if (rawPath.startsWith("packages/") || rawPath.startsWith("./packages/")) {
    return resolve(repoRoot, rawPath.replace(/^\.\//, ""));
  }

  return resolve(serverRoot, rawPath);
}

function ensureDb(): Database {
  if (!db) {
    const dbPath = resolveDbPath();
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(dbPath);
    dbPathUsed = dbPath;
    console.log(`🗄️  SQLite DB path: ${dbPath}`);
  }
  return db;
}

export function initDb() {
  const database = ensureDb();
  database.run("PRAGMA foreign_keys = ON");

  // Strict pre-launch mode: do not auto-support the pre-split legacy "location" schema.
  const unsupportedLegacySchema = database
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='location'")
    .get();
  if (unsupportedLegacySchema) {
    throw new Error(
      'Unsupported legacy schema detected ("location" table). ' +
      "Run an explicit migration to the modern schema before starting this server."
    );
  }

  // Strict schema path only: entities + category-isolated tables + entity-referenced content tables.
  splitLocationsToEntities(database);

  addEntityProvenance(database);

  addEntityPendingSuggestions(database);

  collapseAiProvenance(database);

  dropReviewPipelineSchema(database);

  addPhotoImportFields(database);

  renameReservationUrlToBookingUrl(database);

  addAppSettings(database);

  addEntityPhoneUnavailable(database);

  const nightlifeIdealForCleanup = clearInvalidNightlifeIdealFor(database);
  if (nightlifeIdealForCleanup.cleared > 0) {
    console.log(
      `🧹 Cleared invalid nightlife Ideal For selections for ${nightlifeIdealForCleanup.cleared} location(s)`
    );
  }
}

export function getDb(): Database {
  return ensureDb();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
