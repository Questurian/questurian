import { Database } from "bun:sqlite";
import { join, dirname, isAbsolute, resolve } from "path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "url";
import { splitLocationTables } from "./migrations/split-location-tables";
import { migrateInstagramEmbedsToUsername } from "./migrations/instagram-embeds-username";
import { migrateUploadsToPhotographerCredit } from "./migrations/uploads-photographer-credit";
import { removeLocationImagesField } from "./migrations/remove-location-images-field";
import { removeLocationDiningType } from "./migrations/remove-location-dining-type";
import { addCategoryConstraint } from "./migrations/add-category-constraint";
import { addLocationSlug } from "./migrations/add-location-slug";
import { addTaxonomyStatus } from "./migrations/add-taxonomy-status";
import { addLocationDistrict } from "./migrations/add-location-district";
import { addTaxonomyCorrections } from "./migrations/add-taxonomy-corrections";
import { addPayloadSyncTracking } from "./migrations/add-payload-sync-tracking";
import { addUploadMetadata } from "./migrations/add-upload-metadata";
import { migrateToImageSets } from "./migrations/add-image-sets";
import { addLocationType } from "./migrations/add-location-type";
import { addUploadAltTexts } from "./migrations/add-upload-alt-texts";
import { removeUploadRedundantFields } from "./migrations/remove-upload-redundant-fields";
import { removeUnusedUploadFields } from "./migrations/remove-unused-upload-fields";
import { convertImageSetsToSingleObject } from "./migrations/convert-imagesets-to-single-object";
import { addPayloadLocationRef } from "./migrations/add-payload-location-ref";
import { addLocationUpdatedAt } from "./migrations/add-location-updated-at";
import { addLocationPlaceId } from "./migrations/add-location-place-id";
import { addLocationIanaTimeId } from "./migrations/add-location-iana-time-id";
import { addTripadvisorFields } from "./migrations/add-tripadvisor-fields";
import { addTripadvisorPlacesTable } from "./migrations/add-tripadvisor-places-table";
import { addTripadvisorTaxonomyFields } from "./migrations/add-tripadvisor-taxonomy-fields";
import { addLocationEnrichmentFields } from "./migrations/add-location-enrichment-fields";
import { addReviewsTracking } from "./migrations/add-reviews-tracking";
import { addLocationIdealFor } from "./migrations/add-location-ideal-for";

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

  // Check if old schema exists (location table with type column)
  const oldSchemaExists = database.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='location'"
  ).get();

  if (oldSchemaExists) {
    console.log("🔄 Old schema detected. Running migration...");
    const migrationSuccess = splitLocationTables();

    if (!migrationSuccess) {
      throw new Error("Database migration failed! Check logs above.");
    }

    // Create location_taxonomy table if it doesn't exist
    database.run(`
      CREATE TABLE IF NOT EXISTS location_taxonomy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country TEXT NOT NULL,
        city TEXT,
        neighborhood TEXT,
        locationKey TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure status column exists for old-schema databases
    addTaxonomyStatus(database);
  }

  // New schema: Create three normalized tables

  database.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT,
      address TEXT NOT NULL,
      url TEXT NOT NULL,
      lat REAL,
      lng REAL,
      category TEXT DEFAULT 'attractions'
        CHECK(category IN ('dining', 'accommodations', 'attractions', 'nightlife')),
      locationKey TEXT,
      district TEXT,
      contactAddress TEXT,
      countryCode TEXT,
      iana_time_id TEXT,
      phoneNumber TEXT,
      website TEXT,
      email TEXT,
      hours_json TEXT,
      neighborhood_description TEXT,
      ideal_for_json TEXT,
      tripadvisor_meal_types TEXT,
      tripadvisor_cuisines TEXT,
      tripadvisor_features TEXT,
      slug TEXT UNIQUE,
      tripadvisor_url TEXT,
      tripadvisor_location_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, address)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS instagram_embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      photographerCredit TEXT,
      images TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

  // Create location hierarchy table for hierarchical location data
  database.run(`
    CREATE TABLE IF NOT EXISTS location_taxonomy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      city TEXT,
      neighborhood TEXT,
      locationKey TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run migration to update existing instagram_embeds tables
  migrateInstagramEmbedsToUsername();

  // Run migration to update existing uploads table
  migrateUploadsToPhotographerCredit();

  // Run migration to remove unused images field from locations table
  removeLocationImagesField(database);

  // Run migration to remove unused dining_type field from locations table
  removeLocationDiningType(database);

  // Run migration to add CHECK constraint to category field
  addCategoryConstraint(database);

  // Run migration to add slug column to locations table
  addLocationSlug(database);

  // Run migration to add status column to location_taxonomy table
  addTaxonomyStatus(database);

  // Run migration to add district column to locations table
  addLocationDistrict(database);

  // Run migration to add taxonomy corrections table and fix data
  addTaxonomyCorrections(database);

  // Run migration to add Payload sync tracking table
  addPayloadSyncTracking(database);

  // Run migration to add imageMetadata column to uploads table
  addUploadMetadata();

  // Run migration to add imageSets and uploadFormat columns to uploads table
  migrateToImageSets();

  // Run migration to add altTexts column to uploads table
  addUploadAltTexts();

  // Run migration to remove redundant photographerCredit and altTexts columns from uploads table
  removeUploadRedundantFields();

  // Run migration to remove unused images and imageMetadata columns from uploads table
  removeUnusedUploadFields();

  // Run migration to convert imageSets from array to single object
  convertImageSetsToSingleObject();

  // Run migration to add payload_location_ref column to locations table
  addPayloadLocationRef(database);

  // Run migration to add updated_at column to locations table
  addLocationUpdatedAt(database);

  // Run migration to add type column to locations table
  addLocationType(database);

  // Run migration to add place_id column to locations table
  addLocationPlaceId(database);

  // Run migration to add iana_time_id column to locations table
  addLocationIanaTimeId(database);

  // Run migration to add TripAdvisor fields to locations table
  addTripadvisorFields(database);

  // Run migration to add tripadvisor_places table for SerpAPI data
  addTripadvisorPlacesTable(database);

  // Run migration to add enrichment fields to locations table
  addLocationEnrichmentFields(database);

  // Run migration to add TripAdvisor taxonomy fields to locations table
  addTripadvisorTaxonomyFields(database);

  // Run migration to add reviews tracking fields to locations table
  addReviewsTracking(database);

  // Run migration to add Ideal For tags field to locations table
  addLocationIdealFor(database);
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
