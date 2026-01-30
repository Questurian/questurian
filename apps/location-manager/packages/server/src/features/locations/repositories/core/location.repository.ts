import { getDb } from "@server/shared/db/client";
import type { Location } from "../../models/location";
import { isLocationInScope } from "../../utils/location-utils";
import { slugifyLocationPart } from "../../services/geocoding/location-geocoding.helper";

/**
 * Save a new location or update an existing one (upsert).
 *
 * Uses the UNIQUE constraint on (name, address) to determine if location exists.
 * If location exists, updates all fields except id and created_at.
 * Automatically generates a slug from the location name if not provided.
 *
 * @param location - Location object to save
 * @returns The location ID on success, or false on failure
 */
export function saveLocation(location: Location): number | boolean {
  // Generate slug if not provided
  if (!location.slug && location.name) {
    location.slug = slugifyLocationPart(location.name);
  }

  try {
    const db = getDb();
    const query = db.query(`
      INSERT INTO locations (name, title, address, url, lat, lng, category, type, locationKey, district, contactAddress, countryCode, iana_time_id, phoneNumber, website, email, hours_json, neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id, payload_location_ref, updated_at)
      VALUES ($name, $title, $address, $url, $lat, $lng, $category, $type, $locationKey, $district, $contactAddress, $countryCode, $iana_time_id, $phoneNumber, $website, $email, $hours_json, $neighborhood_description, $slug, $place_id, $tripadvisor_url, $tripadvisor_location_id, $payload_location_ref, CURRENT_TIMESTAMP)
      ON CONFLICT(name, address) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        lat = excluded.lat,
        lng = excluded.lng,
        category = excluded.category,
        type = excluded.type,
        locationKey = excluded.locationKey,
        district = excluded.district,
        contactAddress = excluded.contactAddress,
        countryCode = excluded.countryCode,
        iana_time_id = excluded.iana_time_id,
        phoneNumber = excluded.phoneNumber,
        website = excluded.website,
        email = excluded.email,
        hours_json = excluded.hours_json,
        neighborhood_description = excluded.neighborhood_description,
        slug = excluded.slug,
        place_id = excluded.place_id,
        tripadvisor_url = excluded.tripadvisor_url,
        tripadvisor_location_id = excluded.tripadvisor_location_id,
        payload_location_ref = excluded.payload_location_ref
    `);

    query.run({
      $name: location.name,
      $title: location.title || null,
      $address: location.address,
      $url: location.url,
      $lat: location.lat || null,
      $lng: location.lng || null,
      $category: location.category || "attractions",
      $type: (location as any).type || null,
      $locationKey: location.locationKey || null,
      $district: location.district || null,
      $contactAddress: location.contactAddress || null,
      $countryCode: location.countryCode || null,
      $iana_time_id: location.ianaTimeId || null,
      $phoneNumber: location.phoneNumber || null,
      $website: location.website || null,
      $email: location.email || null,
      $hours_json: location.hoursJson || null,
      $neighborhood_description: location.neighborhoodDescription || null,
      $slug: location.slug || null,
      $place_id: location.placeId || null,
      $tripadvisor_url: location.tripadvisorUrl || null,
      $tripadvisor_location_id: location.tripadvisorLocationId || null,
      $payload_location_ref: location.payload_location_ref || null,
    });

    const result = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
    return result.id;
  } catch (error) {
    console.error("Error saving location to DB:", error);
    return false;
  }
}

/**
 * Update specific fields of a location by ID (partial update).
 *
 * Dynamically builds the SQL UPDATE statement based on which fields are provided
 * in the updates object. Only non-undefined fields will be updated.
 *
 * @param id - Location ID to update
 * @param updates - Partial location object with fields to update
 * @returns true if update succeeded, false if no fields provided or error occurred
 */
export function updateLocationById(id: number, updates: Partial<Location>): boolean {
  try {
    const db = getDb();
    const setClause: string[] = [];
    const params: Record<string, unknown> = { $id: id };

    if (updates.name !== undefined) {
      setClause.push("name = $name");
      params.$name = updates.name;
    }
    if (updates.title !== undefined) {
      setClause.push("title = $title");
      params.$title = updates.title;
    }
    if (updates.address !== undefined) {
      setClause.push("address = $address");
      params.$address = updates.address;
    }
    if (updates.category !== undefined) {
      setClause.push("category = $category");
      params.$category = updates.category;
    }
    if (updates.type !== undefined) {
      setClause.push("type = $type");
      params.$type = updates.type;
    }
    if (updates.url !== undefined) {
      setClause.push("url = $url");
      params.$url = updates.url;
    }
    if (updates.lat !== undefined) {
      setClause.push("lat = $lat");
      params.$lat = updates.lat;
    }
    if (updates.lng !== undefined) {
      setClause.push("lng = $lng");
      params.$lng = updates.lng;
    }
    if (updates.locationKey !== undefined) {
      setClause.push("locationKey = $locationKey");
      params.$locationKey = updates.locationKey;
    }
    if (updates.district !== undefined) {
      setClause.push("district = $district");
      params.$district = updates.district;
    }
    if (updates.contactAddress !== undefined) {
      setClause.push("contactAddress = $contactAddress");
      params.$contactAddress = updates.contactAddress;
    }
    if (updates.countryCode !== undefined) {
      setClause.push("countryCode = $countryCode");
      params.$countryCode = updates.countryCode;
    }
    if (updates.ianaTimeId !== undefined) {
      setClause.push("iana_time_id = $iana_time_id");
      params.$iana_time_id = updates.ianaTimeId;
    }
    if (updates.phoneNumber !== undefined) {
      setClause.push("phoneNumber = $phoneNumber");
      params.$phoneNumber = updates.phoneNumber;
    }
    if (updates.website !== undefined) {
      setClause.push("website = $website");
      params.$website = updates.website;
    }
    if (updates.email !== undefined) {
      setClause.push("email = $email");
      params.$email = updates.email;
    }
    if (updates.hoursJson !== undefined) {
      setClause.push("hours_json = $hours_json");
      params.$hours_json = updates.hoursJson;
    }
    if (updates.neighborhoodDescription !== undefined) {
      setClause.push("neighborhood_description = $neighborhood_description");
      params.$neighborhood_description = updates.neighborhoodDescription;
    }
    if (updates.payload_location_ref !== undefined) {
      setClause.push("payload_location_ref = $payload_location_ref");
      params.$payload_location_ref = updates.payload_location_ref;
    }
    if (updates.placeId !== undefined) {
      setClause.push("place_id = $place_id");
      params.$place_id = updates.placeId;
    }
    if (updates.tripadvisorUrl !== undefined) {
      setClause.push("tripadvisor_url = $tripadvisor_url");
      params.$tripadvisor_url = updates.tripadvisorUrl;
    }
    if (updates.tripadvisorLocationId !== undefined) {
      setClause.push("tripadvisor_location_id = $tripadvisor_location_id");
      params.$tripadvisor_location_id = updates.tripadvisorLocationId;
    }
    if (updates.updated_at !== undefined) {
      setClause.push("updated_at = $updated_at");
      params.$updated_at = updates.updated_at;
    } else {
      // Automatically set updated_at to current timestamp for all updates
      // UNLESS explicitly provided (needed for sync to set matching timestamp)
      setClause.push("updated_at = CURRENT_TIMESTAMP");
    }

    if (setClause.length === 0) {
      return false;
    }

    const query = db.query(`
      UPDATE locations
      SET ${setClause.join(", ")}
      WHERE id = $id
    `);

    // Type cast necessary due to dynamic parameter building
    query.run(params as Record<string, string | number | null>);
    return true;
  } catch (error) {
    console.error("Error updating location:", error);
    return false;
  }
}

/**
 * Get all locations with approved taxonomy.
 *
 * Returns locations that either have no locationKey or have a locationKey
 * that is approved in the location_taxonomy table. Pending or unapproved
 * locations are filtered out.
 *
 * @returns Array of all approved locations, sorted by creation date (newest first)
 */
export function getAllLocations(): Location[] {
  const db = getDb();
  const query = db.query(`
    SELECT DISTINCT l.id, l.name, l.title, l.address, l.url, l.lat, l.lng,
           l.category, l.type, l.locationKey, l.district, l.contactAddress,
           l.countryCode, l.iana_time_id as ianaTimeId, l.phoneNumber, l.website, l.email, l.hours_json as hoursJson,
           l.neighborhood_description as neighborhoodDescription, l.slug, l.place_id as placeId,
           l.tripadvisor_url as tripadvisorUrl, l.tripadvisor_location_id as tripadvisorLocationId,
           l.payload_location_ref, l.created_at, l.updated_at
    FROM locations l
    LEFT JOIN location_taxonomy t ON l.locationKey = t.locationKey
    WHERE l.locationKey IS NULL OR t.status = 'approved'
    ORDER BY l.created_at DESC
  `);
  return query.all() as Location[];
}

/**
 * Get all locations in a specific category with approved taxonomy.
 *
 * @param category - Category to filter by (e.g., "dining", "attractions", "nightlife")
 * @returns Array of locations in the specified category, sorted by creation date (newest first)
 */
export function getLocationsByCategory(category: string): Location[] {
  const db = getDb();
  const query = db.query(`
    SELECT DISTINCT l.id, l.name, l.title, l.address, l.url, l.lat, l.lng,
           l.category, l.type, l.locationKey, l.district, l.contactAddress,
           l.countryCode, l.iana_time_id as ianaTimeId, l.phoneNumber, l.website, l.email, l.hours_json as hoursJson,
           l.neighborhood_description as neighborhoodDescription, l.slug, l.place_id as placeId,
           l.tripadvisor_url as tripadvisorUrl, l.tripadvisor_location_id as tripadvisorLocationId,
           l.payload_location_ref, l.created_at, l.updated_at
    FROM locations l
    LEFT JOIN location_taxonomy t ON l.locationKey = t.locationKey
    WHERE l.category = $category
      AND (l.locationKey IS NULL OR t.status = 'approved')
    ORDER BY l.created_at DESC
  `);
  return query.all({ $category: category }) as Location[];
}

/**
 * Get a single location by ID with approved taxonomy.
 *
 * @param id - Location ID to retrieve
 * @returns Location object if found and approved, null otherwise
 */
export function getLocationById(id: number): Location | null {
  const db = getDb();
  const query = db.query(`
    SELECT DISTINCT l.id, l.name, l.title, l.address, l.url, l.lat, l.lng,
           l.category, l.type, l.locationKey, l.district, l.contactAddress,
           l.countryCode, l.iana_time_id as ianaTimeId, l.phoneNumber, l.website, l.email, l.hours_json as hoursJson,
           l.neighborhood_description as neighborhoodDescription, l.slug, l.place_id as placeId,
           l.tripadvisor_url as tripadvisorUrl, l.tripadvisor_location_id as tripadvisorLocationId,
           l.payload_location_ref, l.created_at, l.updated_at
    FROM locations l
    LEFT JOIN location_taxonomy t ON l.locationKey = t.locationKey
    WHERE l.id = $id
      AND (l.locationKey IS NULL OR t.status = 'approved')
  `);
  const row = query.get({ $id: id }) as Location | undefined;
  return row || null;
}

/**
 * Get a location by ID for update operations (ignores taxonomy status)
 */
export function getLocationByIdForUpdate(id: number): Location | null {
  const db = getDb();
  const query = db.query(`
    SELECT DISTINCT l.id, l.name, l.title, l.address, l.url, l.lat, l.lng,
           l.category, l.type, l.locationKey, l.district, l.contactAddress,
           l.countryCode, l.iana_time_id as ianaTimeId, l.phoneNumber, l.website, l.email, l.hours_json as hoursJson,
           l.neighborhood_description as neighborhoodDescription, l.slug, l.place_id as placeId,
           l.tripadvisor_url as tripadvisorUrl, l.tripadvisor_location_id as tripadvisorLocationId,
           l.payload_location_ref, l.created_at, l.updated_at
    FROM locations l
    LEFT JOIN location_taxonomy t ON l.locationKey = t.locationKey
    WHERE l.id = $id
  `);
  const row = query.get({ $id: id }) as Location | undefined;
  return row || null;
}

/**
 * Get a single location by its URL-friendly slug.
 *
 * @param slug - URL slug to search for (e.g., "panchita-miraflores")
 * @returns Location object if found, null otherwise
 */
export function getLocationBySlug(slug: string): Location | null {
  const db = getDb();
    const query = db.query("SELECT id, name, title, address, url, lat, lng, category, type, locationKey, district, contactAddress, countryCode, iana_time_id as ianaTimeId, phoneNumber, website, email, hours_json as hoursJson, neighborhood_description as neighborhoodDescription, slug, place_id as placeId, tripadvisor_url as tripadvisorUrl, tripadvisor_location_id as tripadvisorLocationId, payload_location_ref, created_at, updated_at FROM locations WHERE slug = $slug");
  const row = query.get({ $slug: slug }) as Location | undefined;
  return row || null;
}

/**
 * Clear all data from the locations table (for development/testing only).
 *
 * WARNING: This deletes all locations permanently. Use with caution.
 */
export function clearDatabase() {
  try {
    const db = getDb();
    db.run("DELETE FROM locations");
    db.run("DELETE FROM instagram_embeds");
    db.run("DELETE FROM uploads");
    db.run("VACUUM");
    return true;
  } catch (error) {
    console.error("Error clearing database:", error);
    return false;
  }
}

/**
 * Delete a location by ID along with all related content.
 *
 * Cascades deletion to related instagram_embeds and uploads tables.
 * Note: File cleanup (images) is handled by the service layer, not here.
 *
 * @param id - Location ID to delete
 * @returns true if deletion succeeded, false if location not found or error occurred
 */
export function deleteLocationById(id: number): boolean {
  try {
    const db = getDb();

    // First get the location to check if it exists
    const location = getLocationById(id);
    if (!location) {
      return false;
    }

    // Delete related instagram_embeds
    db.run("DELETE FROM instagram_embeds WHERE location_id = ?", [id]);

    // Delete related uploads
    db.run("DELETE FROM uploads WHERE location_id = ?", [id]);

    // Delete payload sync state (if table exists)
    try {
      db.run("DELETE FROM payload_sync_state WHERE location_id = ?", [id]);
    } catch {
      // Table may not exist yet (pre-migration), ignore error
    }

    // Delete the location itself
    const deleteStmt = db.query("DELETE FROM locations WHERE id = $id");
    const result = deleteStmt.run({ $id: id });

    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting location by id:", error);
    return false;
  }
}

/**
 * Delete a location by its URL slug along with all related content.
 *
 * Cascades deletion to related instagram_embeds and uploads tables.
 * Note: File cleanup (images) is handled by the service layer, not here.
 *
 * @param slug - Location slug to delete (e.g., "panchita-miraflores")
 * @returns true if deletion succeeded, false if location not found or error occurred
 */
export function deleteLocationBySlug(slug: string): boolean {
  try {
    const db = getDb();

    // First get the location to check if it exists
    const location = getLocationBySlug(slug);
    if (!location || !location.id) {
      return false;
    }

    // Delete related instagram_embeds
    db.run("DELETE FROM instagram_embeds WHERE location_id = ?", [location.id]);

    // Delete related uploads
    db.run("DELETE FROM uploads WHERE location_id = ?", [location.id]);

    // Delete payload sync state (if table exists)
    try {
      db.run("DELETE FROM payload_sync_state WHERE location_id = ?", [location.id]);
    } catch {
      // Table may not exist yet (pre-migration), ignore error
    }

    // Delete the location itself
    const deleteStmt = db.query("DELETE FROM locations WHERE slug = $slug");
    const result = deleteStmt.run({ $slug: slug });

    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting location by slug:", error);
    return false;
  }
}


/**
 * Update all locations by replacing a value in locationKey
 * @param incorrectValue - The value to search for
 * @param correctValue - The value to replace with
 * @param partType - Which part of the locationKey to match
 * @returns Count of updated locations
 */
export function bulkUpdateLocationKeys(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): number {
  const db = getDb();

  // Build LIKE pattern based on part type
  let likePattern: string;
  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    // neighborhood
    likePattern = `%|${incorrectValue}`;
  }

  try {
    const query = db.query(`
      UPDATE locations
      SET locationKey = REPLACE(locationKey, $incorrectValue, $correctValue)
      WHERE locationKey LIKE $pattern
    `);

    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern
    });

    return result.changes;
  } catch (error) {
    console.error("Error bulk updating location keys:", error);
    return 0;
  }
}
