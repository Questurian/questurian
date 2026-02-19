import { getDb } from "@server/shared/db/client";
import type { Location, LocationCategory } from "../../models/location";
import { slugifyLocationPart } from "../../services/geocoding/location-geocoding.helper";

const CATEGORY_VALUES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
];

const LOCATION_SELECT_COLUMNS = `
  e.id,
  e.name,
  e.title,
  e.address,
  e.url,
  e.lat,
  e.lng,
  e.category,
  COALESCE(d.type, n.type, a.type, at.type) as type,
  e.locationKey,
  e.district,
  e.contactAddress,
  e.countryCode,
  e.iana_time_id as ianaTimeId,
  e.phoneNumber,
  e.website,
  e.email,
  COALESCE(d.hours_json, n.hours_json, a.hours_json, at.hours_json) as hoursJson,
  e.neighborhood_description as neighborhoodDescription,
  COALESCE(d.ideal_for_json, n.ideal_for_json, a.ideal_for_json, at.ideal_for_json) as idealForJson,
  COALESCE(d.nightlife_details_json, n.nightlife_details_json, a.nightlife_details_json, at.nightlife_details_json) as nightlifeDetailsJson,
  COALESCE(d.accommodations_details_json, n.accommodations_details_json, a.accommodations_details_json, at.accommodations_details_json) as accommodationsDetailsJson,
  COALESCE(d.tripadvisor_meal_types, n.tripadvisor_meal_types, a.tripadvisor_meal_types, at.tripadvisor_meal_types) as tripadvisorMealTypesJson,
  COALESCE(d.tripadvisor_cuisines, n.tripadvisor_cuisines, a.tripadvisor_cuisines, at.tripadvisor_cuisines) as tripadvisorCuisinesJson,
  COALESCE(d.tripadvisor_features, n.tripadvisor_features, a.tripadvisor_features, at.tripadvisor_features) as tripadvisorFeaturesJson,
  COALESCE(d.price_level, n.price_level, a.price_level, at.price_level) as priceLevel,
  e.slug,
  e.place_id as placeId,
  e.tripadvisor_url as tripadvisorUrl,
  e.tripadvisor_location_id as tripadvisorLocationId,
  e.payload_location_ref,
  e.reviews_fetched_at as reviewsFetchedAt,
  e.reviews_count as reviewsCount,
  e.reviews_google_count as reviewsGoogleCount,
  e.reviews_tripadvisor_count as reviewsTripadvisorCount,
  e.reviews_enabled as reviewsEnabled,
  e.created_at,
  e.updated_at
`;

const LOCATION_FROM_AND_JOINS = `
  FROM entities e
  LEFT JOIN dining_locations d ON d.entity_id = e.id
  LEFT JOIN nightlife_locations n ON n.entity_id = e.id
  LEFT JOIN accommodations_locations a ON a.entity_id = e.id
  LEFT JOIN attractions_locations at ON at.entity_id = e.id
`;

const LOCATION_SELECT = `
  SELECT
    ${LOCATION_SELECT_COLUMNS}
  ${LOCATION_FROM_AND_JOINS}
`;

function getTypedTable(category: LocationCategory): string {
  switch (category) {
    case "dining":
      return "dining_locations";
    case "nightlife":
      return "nightlife_locations";
    case "accommodations":
      return "accommodations_locations";
    case "attractions":
      return "attractions_locations";
  }
  throw new Error(`Invalid location category: ${String(category)}`);
}

function parseCategory(input?: string | null): LocationCategory {
  if (input && CATEGORY_VALUES.includes(input as LocationCategory)) {
    return input as LocationCategory;
  }
  throw new Error(`Invalid location category: ${String(input)}`);
}

function upsertTypedRow(
  entityId: number,
  category: LocationCategory,
  params: {
    type?: string | null;
    hoursJson?: string | null;
    idealForJson?: string | null;
    nightlifeDetailsJson?: string | null;
    accommodationsDetailsJson?: string | null;
    tripadvisorMealTypesJson?: string | null;
    tripadvisorCuisinesJson?: string | null;
    tripadvisorFeaturesJson?: string | null;
    priceLevel?: string | null;
  }
): void {
  const db = getDb();
  const table = getTypedTable(category);
  db.query(`
    INSERT INTO ${table} (
      entity_id,
      type,
      hours_json,
      ideal_for_json,
      nightlife_details_json,
      accommodations_details_json,
      tripadvisor_meal_types,
      tripadvisor_cuisines,
      tripadvisor_features,
      price_level
    )
    VALUES (
      $entity_id,
      $type,
      $hours_json,
      $ideal_for_json,
      $nightlife_details_json,
      $accommodations_details_json,
      $tripadvisor_meal_types,
      $tripadvisor_cuisines,
      $tripadvisor_features,
      $price_level
    )
    ON CONFLICT(entity_id) DO UPDATE SET
      type = excluded.type,
      hours_json = excluded.hours_json,
      ideal_for_json = excluded.ideal_for_json,
      nightlife_details_json = excluded.nightlife_details_json,
      accommodations_details_json = excluded.accommodations_details_json,
      tripadvisor_meal_types = excluded.tripadvisor_meal_types,
      tripadvisor_cuisines = excluded.tripadvisor_cuisines,
      tripadvisor_features = excluded.tripadvisor_features,
      price_level = excluded.price_level
  `).run({
    $entity_id: entityId,
    $type: params.type ?? null,
    $hours_json: params.hoursJson ?? null,
    $ideal_for_json: params.idealForJson ?? null,
    $nightlife_details_json: params.nightlifeDetailsJson ?? null,
    $accommodations_details_json: params.accommodationsDetailsJson ?? null,
    $tripadvisor_meal_types: params.tripadvisorMealTypesJson ?? null,
    $tripadvisor_cuisines: params.tripadvisorCuisinesJson ?? null,
    $tripadvisor_features: params.tripadvisorFeaturesJson ?? null,
    $price_level: params.priceLevel ?? null,
  });
}

function clearTypedRowsForEntity(entityId: number): void {
  const db = getDb();
  db.run("DELETE FROM dining_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM nightlife_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM accommodations_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM attractions_locations WHERE entity_id = ?", [entityId]);
}

function buildLocationRowWithCountsQuery(whereClause: string): string {
  return `
    SELECT
      ${LOCATION_SELECT_COLUMNS},
      (SELECT COUNT(*) FROM uploads u WHERE u.entity_id = e.id) as uploadsCount,
      (SELECT COUNT(*) FROM instagram_embeds ie WHERE ie.entity_id = e.id) as instagramEmbedsCount
    ${LOCATION_FROM_AND_JOINS}
    ${whereClause}
  `;
}

/**
 * Save a new location or update an existing one (upsert by category + name + address).
 */
export function saveLocation(location: Location): number | boolean {
  if (!location.slug && location.name) {
    location.slug = slugifyLocationPart(location.name);
  }

  const db = getDb();

  try {
    const category = parseCategory(location.category);

    db.run("BEGIN TRANSACTION");

    const existing = db.query(`
      SELECT id FROM entities
      WHERE category = $category AND name = $name AND address = $address
      LIMIT 1
    `).get({
      $category: category,
      $name: location.name,
      $address: location.address,
    }) as { id: number } | undefined;

    let entityId: number;

    if (existing) {
      entityId = existing.id;
      db.query(`
        UPDATE entities
        SET
          title = $title,
          url = $url,
          lat = $lat,
          lng = $lng,
          locationKey = $locationKey,
          district = $district,
          contactAddress = $contactAddress,
          countryCode = $countryCode,
          iana_time_id = $iana_time_id,
          phoneNumber = $phoneNumber,
          website = $website,
          email = $email,
          neighborhood_description = $neighborhood_description,
          slug = $slug,
          place_id = $place_id,
          tripadvisor_url = $tripadvisor_url,
          tripadvisor_location_id = $tripadvisor_location_id,
          payload_location_ref = $payload_location_ref,
          reviews_enabled = COALESCE($reviews_enabled, reviews_enabled),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $id
      `).run({
        $id: entityId,
        $title: location.title || null,
        $url: location.url,
        $lat: location.lat ?? null,
        $lng: location.lng ?? null,
        $locationKey: location.locationKey || null,
        $district: location.district || null,
        $contactAddress: location.contactAddress || null,
        $countryCode: location.countryCode || null,
        $iana_time_id: location.ianaTimeId || null,
        $phoneNumber: location.phoneNumber || null,
        $website: location.website || null,
        $email: location.email || null,
        $neighborhood_description: location.neighborhoodDescription || null,
        $slug: location.slug || null,
        $place_id: location.placeId || null,
        $tripadvisor_url: location.tripadvisorUrl || null,
        $tripadvisor_location_id: location.tripadvisorLocationId || null,
        $payload_location_ref: location.payload_location_ref || null,
        $reviews_enabled:
          location.reviewsEnabled == null
            ? null
            : (location.reviewsEnabled ? 1 : 0),
      });
    } else {
      db.query(`
        INSERT INTO entities (
          category,
          name,
          title,
          address,
          url,
          lat,
          lng,
          locationKey,
          district,
          contactAddress,
          countryCode,
          iana_time_id,
          phoneNumber,
          website,
          email,
          neighborhood_description,
          slug,
          place_id,
          tripadvisor_url,
          tripadvisor_location_id,
          payload_location_ref,
          reviews_enabled,
          created_at,
          updated_at
        )
        VALUES (
          $category,
          $name,
          $title,
          $address,
          $url,
          $lat,
          $lng,
          $locationKey,
          $district,
          $contactAddress,
          $countryCode,
          $iana_time_id,
          $phoneNumber,
          $website,
          $email,
          $neighborhood_description,
          $slug,
          $place_id,
          $tripadvisor_url,
          $tripadvisor_location_id,
          $payload_location_ref,
          $reviews_enabled,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).run({
        $category: category,
        $name: location.name,
        $title: location.title || null,
        $address: location.address,
        $url: location.url,
        $lat: location.lat ?? null,
        $lng: location.lng ?? null,
        $locationKey: location.locationKey || null,
        $district: location.district || null,
        $contactAddress: location.contactAddress || null,
        $countryCode: location.countryCode || null,
        $iana_time_id: location.ianaTimeId || null,
        $phoneNumber: location.phoneNumber || null,
        $website: location.website || null,
        $email: location.email || null,
        $neighborhood_description: location.neighborhoodDescription || null,
        $slug: location.slug || null,
        $place_id: location.placeId || null,
        $tripadvisor_url: location.tripadvisorUrl || null,
        $tripadvisor_location_id: location.tripadvisorLocationId || null,
        $payload_location_ref: location.payload_location_ref || null,
        $reviews_enabled: location.reviewsEnabled === false ? 0 : 1,
      });

      const inserted = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
      entityId = inserted.id;
    }

    clearTypedRowsForEntity(entityId);
    upsertTypedRow(entityId, category, {
      type: location.type || null,
      hoursJson: location.hoursJson || null,
      idealForJson: location.idealForJson || null,
      nightlifeDetailsJson: location.nightlifeDetailsJson || null,
      accommodationsDetailsJson: location.accommodationsDetailsJson || null,
      tripadvisorMealTypesJson: location.tripadvisorMealTypesJson || null,
      tripadvisorCuisinesJson: location.tripadvisorCuisinesJson || null,
      tripadvisorFeaturesJson: location.tripadvisorFeaturesJson || null,
      priceLevel: location.priceLevel || null,
    });

    db.run("COMMIT");
    return entityId;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("Error saving location to DB:", error);
    return false;
  }
}

export function updateLocationById(id: number, updates: Partial<Location>): boolean {
  const db = getDb();

  try {
    const current = db
      .query("SELECT category FROM entities WHERE id = $id")
      .get({ $id: id }) as { category: LocationCategory } | undefined;
    if (!current) {
      return false;
    }

    const entitySetClause: string[] = [];
    const entityParams: Record<string, unknown> = { $id: id };

    if (updates.name !== undefined) {
      entitySetClause.push("name = $name");
      entityParams.$name = updates.name;
    }
    if (updates.title !== undefined) {
      entitySetClause.push("title = $title");
      entityParams.$title = updates.title;
    }
    if (updates.address !== undefined) {
      entitySetClause.push("address = $address");
      entityParams.$address = updates.address;
    }
    if (updates.url !== undefined) {
      entitySetClause.push("url = $url");
      entityParams.$url = updates.url;
    }
    if (updates.lat !== undefined) {
      entitySetClause.push("lat = $lat");
      entityParams.$lat = updates.lat;
    }
    if (updates.lng !== undefined) {
      entitySetClause.push("lng = $lng");
      entityParams.$lng = updates.lng;
    }
    if (updates.locationKey !== undefined) {
      entitySetClause.push("locationKey = $locationKey");
      entityParams.$locationKey = updates.locationKey;
    }
    if (updates.district !== undefined) {
      entitySetClause.push("district = $district");
      entityParams.$district = updates.district;
    }
    if (updates.contactAddress !== undefined) {
      entitySetClause.push("contactAddress = $contactAddress");
      entityParams.$contactAddress = updates.contactAddress;
    }
    if (updates.countryCode !== undefined) {
      entitySetClause.push("countryCode = $countryCode");
      entityParams.$countryCode = updates.countryCode;
    }
    if (updates.ianaTimeId !== undefined) {
      entitySetClause.push("iana_time_id = $iana_time_id");
      entityParams.$iana_time_id = updates.ianaTimeId;
    }
    if (updates.phoneNumber !== undefined) {
      entitySetClause.push("phoneNumber = $phoneNumber");
      entityParams.$phoneNumber = updates.phoneNumber;
    }
    if (updates.website !== undefined) {
      entitySetClause.push("website = $website");
      entityParams.$website = updates.website;
    }
    if (updates.email !== undefined) {
      entitySetClause.push("email = $email");
      entityParams.$email = updates.email;
    }
    if (updates.neighborhoodDescription !== undefined) {
      entitySetClause.push("neighborhood_description = $neighborhood_description");
      entityParams.$neighborhood_description = updates.neighborhoodDescription;
    }
    if (updates.slug !== undefined) {
      entitySetClause.push("slug = $slug");
      entityParams.$slug = updates.slug;
    }
    if (updates.placeId !== undefined) {
      entitySetClause.push("place_id = $place_id");
      entityParams.$place_id = updates.placeId;
    }
    if (updates.tripadvisorUrl !== undefined) {
      entitySetClause.push("tripadvisor_url = $tripadvisor_url");
      entityParams.$tripadvisor_url = updates.tripadvisorUrl;
    }
    if (updates.tripadvisorLocationId !== undefined) {
      entitySetClause.push("tripadvisor_location_id = $tripadvisor_location_id");
      entityParams.$tripadvisor_location_id = updates.tripadvisorLocationId;
    }
    if (updates.payload_location_ref !== undefined) {
      entitySetClause.push("payload_location_ref = $payload_location_ref");
      entityParams.$payload_location_ref = updates.payload_location_ref;
    }
    if (updates.reviewsFetchedAt !== undefined) {
      entitySetClause.push("reviews_fetched_at = $reviews_fetched_at");
      entityParams.$reviews_fetched_at = updates.reviewsFetchedAt;
    }
    if (updates.reviewsCount !== undefined) {
      entitySetClause.push("reviews_count = $reviews_count");
      entityParams.$reviews_count = updates.reviewsCount;
    }
    if (updates.reviewsGoogleCount !== undefined) {
      entitySetClause.push("reviews_google_count = $reviews_google_count");
      entityParams.$reviews_google_count = updates.reviewsGoogleCount;
    }
    if (updates.reviewsTripadvisorCount !== undefined) {
      entitySetClause.push("reviews_tripadvisor_count = $reviews_tripadvisor_count");
      entityParams.$reviews_tripadvisor_count = updates.reviewsTripadvisorCount;
    }
    if (updates.reviewsEnabled !== undefined) {
      entitySetClause.push("reviews_enabled = $reviews_enabled");
      entityParams.$reviews_enabled = updates.reviewsEnabled ? 1 : 0;
    }
    if (updates.updated_at !== undefined) {
      entitySetClause.push("updated_at = $updated_at");
      entityParams.$updated_at = updates.updated_at;
    } else {
      entitySetClause.push("updated_at = CURRENT_TIMESTAMP");
    }

    const typedSetClause: string[] = [];
    const typedParams: Record<string, unknown> = { $entity_id: id };

    if (updates.type !== undefined) {
      typedSetClause.push("type = $type");
      typedParams.$type = updates.type;
    }
    if (updates.hoursJson !== undefined) {
      typedSetClause.push("hours_json = $hours_json");
      typedParams.$hours_json = updates.hoursJson;
    }
    if (updates.idealForJson !== undefined) {
      typedSetClause.push("ideal_for_json = $ideal_for_json");
      typedParams.$ideal_for_json = updates.idealForJson;
    }
    if (updates.nightlifeDetailsJson !== undefined) {
      typedSetClause.push("nightlife_details_json = $nightlife_details_json");
      typedParams.$nightlife_details_json = updates.nightlifeDetailsJson;
    }
    if (updates.accommodationsDetailsJson !== undefined) {
      typedSetClause.push("accommodations_details_json = $accommodations_details_json");
      typedParams.$accommodations_details_json = updates.accommodationsDetailsJson;
    }
    if (updates.tripadvisorMealTypesJson !== undefined) {
      typedSetClause.push("tripadvisor_meal_types = $tripadvisor_meal_types");
      typedParams.$tripadvisor_meal_types = updates.tripadvisorMealTypesJson;
    }
    if (updates.tripadvisorCuisinesJson !== undefined) {
      typedSetClause.push("tripadvisor_cuisines = $tripadvisor_cuisines");
      typedParams.$tripadvisor_cuisines = updates.tripadvisorCuisinesJson;
    }
    if (updates.tripadvisorFeaturesJson !== undefined) {
      typedSetClause.push("tripadvisor_features = $tripadvisor_features");
      typedParams.$tripadvisor_features = updates.tripadvisorFeaturesJson;
    }
    if (updates.priceLevel !== undefined) {
      typedSetClause.push("price_level = $price_level");
      typedParams.$price_level = updates.priceLevel;
    }

    if (entitySetClause.length === 0 && typedSetClause.length === 0) {
      return false;
    }

    db.run("BEGIN TRANSACTION");

    if (entitySetClause.length > 0) {
      db.query(`
        UPDATE entities
        SET ${entitySetClause.join(", ")}
        WHERE id = $id
      `).run(entityParams as Record<string, string | number | null>);
    }

    if (typedSetClause.length > 0) {
      const typedTable = getTypedTable(current.category);
      db.query(`
        UPDATE ${typedTable}
        SET ${typedSetClause.join(", ")}
        WHERE entity_id = $entity_id
      `).run(typedParams as Record<string, string | number | null>);
    }

    db.run("COMMIT");
    return true;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("Error updating location:", error);
    return false;
  }
}

export function getAllLocations(): (Location & { uploadsCount: number; instagramEmbedsCount: number })[] {
  const db = getDb();
  const query = db.query(buildLocationRowWithCountsQuery(`
    LEFT JOIN location_taxonomy t ON e.locationKey = t.locationKey
    WHERE e.locationKey IS NULL OR t.status = 'approved'
    ORDER BY e.created_at DESC
  `));
  return query.all() as (Location & { uploadsCount: number; instagramEmbedsCount: number })[];
}

export function getLocationsByCategory(category: string): (Location & { uploadsCount: number; instagramEmbedsCount: number })[] {
  const db = getDb();
  const normalizedCategory = parseCategory(category);
  const query = db.query(buildLocationRowWithCountsQuery(`
    LEFT JOIN location_taxonomy t ON e.locationKey = t.locationKey
    WHERE e.category = $category
      AND (e.locationKey IS NULL OR t.status = 'approved')
    ORDER BY e.created_at DESC
  `));
  return query.all({ $category: normalizedCategory }) as (Location & { uploadsCount: number; instagramEmbedsCount: number })[];
}

export function getLocationById(id: number): Location | null {
  const db = getDb();
  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE e.id = $id
  `);
  const row = query.get({ $id: id }) as Location | undefined;
  return row || null;
}

export function getLocationByIdForUpdate(id: number): Location | null {
  const db = getDb();
  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE e.id = $id
  `);
  const row = query.get({ $id: id }) as Location | undefined;
  return row || null;
}

export function getLocationCategoryById(id: number): LocationCategory | null {
  const db = getDb();
  const row = db
    .query("SELECT category FROM entities WHERE id = $id")
    .get({ $id: id }) as { category: LocationCategory } | undefined;
  return row?.category || null;
}

export function findPotentialDuplicateLocations(params: {
  address: string;
  tripadvisorUrl?: string | null;
  tripadvisorLocationId?: string | null;
}): Location[] {
  const db = getDb();
  const normalizedAddress = params.address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const whereClauses: string[] = [
    "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(e.address), ',', ''), '.', ''), '#', ''), '-', ''), ' ', '')) = $normalized_address",
  ];
  const queryParams: Record<string, string | null> = {
    $normalized_address: normalizedAddress,
  };

  if (params.tripadvisorLocationId) {
    whereClauses.push("e.tripadvisor_location_id = $tripadvisor_location_id");
    queryParams.$tripadvisor_location_id = params.tripadvisorLocationId;
  }

  if (params.tripadvisorUrl) {
    whereClauses.push("e.tripadvisor_url = $tripadvisor_url");
    queryParams.$tripadvisor_url = params.tripadvisorUrl;
  }

  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE ${whereClauses.join(" OR ")}
  `);

  return query.all(queryParams) as Location[];
}

export function getLocationBySlug(slug: string): Location | null {
  const db = getDb();
  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE e.slug = $slug
  `);
  const row = query.get({ $slug: slug }) as Location | undefined;
  return row || null;
}

export function deleteLocationById(id: number): boolean {
  try {
    const db = getDb();
    const result = db.query("DELETE FROM entities WHERE id = $id").run({ $id: id });
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting location by id:", error);
    return false;
  }
}

export function deleteLocationBySlug(slug: string): boolean {
  try {
    const db = getDb();
    const result = db.query("DELETE FROM entities WHERE slug = $slug").run({ $slug: slug });
    return result.changes > 0;
  } catch (error) {
    console.error("Error deleting location by slug:", error);
    return false;
  }
}

export function bulkUpdateLocationKeys(
  incorrectValue: string,
  correctValue: string,
  partType: "country" | "city" | "neighborhood"
): number {
  const db = getDb();
  let likePattern: string;

  if (partType === "country") {
    likePattern = `${incorrectValue}%`;
  } else if (partType === "city") {
    likePattern = `%|${incorrectValue}%`;
  } else {
    likePattern = `%|${incorrectValue}`;
  }

  try {
    const query = db.query(`
      UPDATE entities
      SET locationKey = REPLACE(locationKey, $incorrectValue, $correctValue)
      WHERE locationKey LIKE $pattern
    `);

    const result = query.run({
      $incorrectValue: incorrectValue,
      $correctValue: correctValue,
      $pattern: likePattern,
    });

    return result.changes;
  } catch (error) {
    console.error("Error bulk updating location keys:", error);
    return 0;
  }
}
