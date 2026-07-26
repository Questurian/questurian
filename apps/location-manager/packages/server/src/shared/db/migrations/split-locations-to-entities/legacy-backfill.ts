import type { Database } from "bun:sqlite";
import { CATEGORY_VALUES } from "./categories";
import { getTableColumns, tableExists } from "./database";

export function renameLegacyTable(db: Database, tableName: string): string | null {
  if (!tableExists(db, tableName)) return null;

  const backupName = `${tableName}_legacy_backup`;
  if (tableExists(db, backupName)) {
    throw new Error(
      `Expected to create backup table "${backupName}", but it already exists. ` +
      `Manual intervention required before migration can continue.`
    );
  }

  db.run(`ALTER TABLE ${tableName} RENAME TO ${backupName}`);
  return backupName;
}

export function migrateLocationsBackupIntoEntities(db: Database, backupTable: string): void {
  const columns = getTableColumns(db, backupTable);
  const col = (name: string, fallback = "NULL") => (columns.has(name) ? name : fallback);

  db.run(`
    INSERT INTO entities (
      id, category, name, title, address, url, lat, lng, locationKey, district,
      contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
      neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
      payload_location_ref, reviews_fetched_at, reviews_count, reviews_google_count,
      reviews_tripadvisor_count, reviews_enabled, created_at, updated_at
    )
    SELECT
      id,
      COALESCE(${col("category", "'attractions'")}, 'attractions'),
      ${col("name", "''")},
      ${col("title")},
      ${col("address", "''")},
      ${col("url", "''")},
      ${col("lat")},
      ${col("lng")},
      ${col("locationKey")},
      ${col("district")},
      ${col("contactAddress")},
      ${col("countryCode")},
      ${col("iana_time_id")},
      ${col("phoneNumber")},
      ${col("website")},
      ${col("email")},
      ${col("neighborhood_description")},
      ${col("slug")},
      ${col("place_id")},
      ${col("tripadvisor_url")},
      ${col("tripadvisor_location_id")},
      ${col("payload_location_ref")},
      ${col("reviews_fetched_at")},
      ${col("reviews_count")},
      ${col("reviews_google_count")},
      ${col("reviews_tripadvisor_count")},
      COALESCE(${col("reviews_enabled", "1")}, 1),
      COALESCE(${col("created_at", "CURRENT_TIMESTAMP")}, CURRENT_TIMESTAMP),
      COALESCE(${col("updated_at")}, ${col("created_at", "CURRENT_TIMESTAMP")}, CURRENT_TIMESTAMP)
    FROM ${backupTable}
  `);

  for (const category of CATEGORY_VALUES) {
    db.run(`
      INSERT INTO ${category}_locations (
        entity_id, type, hours_json, ideal_for_json, nightlife_details_json, accommodations_details_json, attractions_details_json,
        key_locations_details_json,
        tripadvisor_meal_types, tripadvisor_cuisines, tripadvisor_features, price_level
      )
      SELECT
        id,
        ${col("type")},
        ${col("hours_json")},
        ${col("ideal_for_json")},
        ${col("nightlife_details_json")},
        ${col("accommodations_details_json")},
        ${col("attractions_details_json")},
        ${col("key_locations_details_json")},
        ${col("tripadvisor_meal_types")},
        ${col("tripadvisor_cuisines")},
        ${col("tripadvisor_features")},
        ${col("price_level")}
      FROM ${backupTable}
      WHERE COALESCE(${col("category", "'attractions'")}, 'attractions') = '${category}'
    `);
  }
}

export function migrateLegacyChildren(db: Database, tableName: string | null): void {
  if (!tableName) return;

  if (tableName.startsWith("instagram_embeds")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO instagram_embeds (
        id, entity_id, username, url, embed_code, instagram, images, original_image_urls, created_at
      )
      SELECT
        id, ${fkColumn}, username, url, embed_code, instagram, images, original_image_urls, created_at
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("uploads")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    const imageSetsExpr = columns.has("imageSets") ? "imageSets" : "NULL";
    const uploadFormatExpr = columns.has("uploadFormat") ? "uploadFormat" : "'imageset'";

    db.run(`
      INSERT INTO uploads (id, entity_id, imageSets, uploadFormat, created_at)
      SELECT id, ${fkColumn}, ${imageSetsExpr}, COALESCE(${uploadFormatExpr}, 'imageset'), created_at
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("payload_sync_state")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO payload_sync_state (
        id, entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      )
      SELECT
        id, ${fkColumn}, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("tripadvisor_places")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO tripadvisor_places (
        id, entity_id, tripadvisor_place_id, place_data, created_at
      )
      SELECT
        id, ${fkColumn}, tripadvisor_place_id, place_data, created_at
      FROM ${tableName}
    `);
  }
}
