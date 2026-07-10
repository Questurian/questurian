import type { Location, LocationCategory } from "../../models/location";
import type { DbClient, UpdatePlan } from "./location-write.types";

function entitySlugExists(db: DbClient, slug: string): boolean {
  const existing = db.query(`
    SELECT id
    FROM entities
    WHERE slug = $slug
    LIMIT 1
  `).get({
    $slug: slug,
  }) as { id: number } | undefined;

  return Boolean(existing);
}

function resolveUniqueEntitySlug(db: DbClient, slug: string | null | undefined): string | null {
  if (!slug) {
    return null;
  }

  if (!entitySlugExists(db, slug)) {
    return slug;
  }

  let suffix = 2;
  let candidate = `${slug}-${suffix}`;

  while (entitySlugExists(db, candidate)) {
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }

  return candidate;
}

export function findExistingEntityId(
  db: DbClient,
  category: LocationCategory,
  location: Location
): number | null {
  const existing = db.query(`
    SELECT id FROM entities
    WHERE category = $category AND name = $name AND address = $address
    LIMIT 1
  `).get({
    $category: category,
    $name: location.name,
    $address: location.address,
  }) as { id: number } | undefined;

  return existing?.id ?? null;
}

export function updateExistingEntity(db: DbClient, entityId: number, location: Location): void {
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
      phone_unavailable = $phone_unavailable,
      website = $website,
      email = $email,
      neighborhood_description = $neighborhood_description,
      slug = $slug,
      place_id = $place_id,
      tripadvisor_url = $tripadvisor_url,
      tripadvisor_location_id = $tripadvisor_location_id,
      payload_location_ref = $payload_location_ref,
      selected_payload_media_set_ids_json = $selected_payload_media_set_ids_json,
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
    $phone_unavailable: location.phoneUnavailable ? 1 : 0,
    $website: location.website || null,
    $email: location.email || null,
    $neighborhood_description: location.neighborhoodDescription || null,
    $slug: location.slug || null,
    $place_id: location.placeId || null,
    $tripadvisor_url: location.tripadvisorUrl || null,
    $tripadvisor_location_id: location.tripadvisorLocationId || null,
    $payload_location_ref: location.payload_location_ref || null,
    $selected_payload_media_set_ids_json: location.selectedPayloadMediaSetIdsJson || null,
  });
}

export function insertEntity(db: DbClient, category: LocationCategory, location: Location): number {
  const resolvedSlug = resolveUniqueEntitySlug(db, location.slug || null);

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
      phone_unavailable,
      website,
      email,
      neighborhood_description,
      slug,
      place_id,
      tripadvisor_url,
      tripadvisor_location_id,
      payload_location_ref,
      selected_payload_media_set_ids_json,
      provenance,
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
      $phone_unavailable,
      $website,
      $email,
      $neighborhood_description,
      $slug,
      $place_id,
      $tripadvisor_url,
      $tripadvisor_location_id,
      $payload_location_ref,
      $selected_payload_media_set_ids_json,
      $provenance,
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
    $phone_unavailable: location.phoneUnavailable ? 1 : 0,
    $website: location.website || null,
    $email: location.email || null,
    $neighborhood_description: location.neighborhoodDescription || null,
    $slug: resolvedSlug,
    $place_id: location.placeId || null,
    $tripadvisor_url: location.tripadvisorUrl || null,
    $tripadvisor_location_id: location.tripadvisorLocationId || null,
    $payload_location_ref: location.payload_location_ref || null,
    $selected_payload_media_set_ids_json: location.selectedPayloadMediaSetIdsJson || null,
    $provenance: location.provenanceJson || null,
  });

  const inserted = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return inserted.id;
}

export function getEntityCategoryById(db: DbClient, id: number): LocationCategory | null {
  const current = db
    .query("SELECT category FROM entities WHERE id = $id")
    .get({ $id: id }) as { category: LocationCategory } | undefined;

  return current?.category ?? null;
}

export function buildEntityUpdatePlan(id: number, updates: Partial<Location>): UpdatePlan {
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
  if (updates.phoneUnavailable !== undefined) {
    setClause.push("phone_unavailable = $phone_unavailable");
    params.$phone_unavailable = updates.phoneUnavailable ? 1 : 0;
  }
  if (updates.website !== undefined) {
    setClause.push("website = $website");
    params.$website = updates.website;
  }
  if (updates.email !== undefined) {
    setClause.push("email = $email");
    params.$email = updates.email;
  }
  if (updates.neighborhoodDescription !== undefined) {
    setClause.push("neighborhood_description = $neighborhood_description");
    params.$neighborhood_description = updates.neighborhoodDescription;
  }
  if (updates.slug !== undefined) {
    setClause.push("slug = $slug");
    params.$slug = updates.slug;
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
  if (updates.payload_location_ref !== undefined) {
    setClause.push("payload_location_ref = $payload_location_ref");
    params.$payload_location_ref = updates.payload_location_ref;
  }
  if (updates.selectedPayloadMediaSetIdsJson !== undefined) {
    setClause.push("selected_payload_media_set_ids_json = $selected_payload_media_set_ids_json");
    params.$selected_payload_media_set_ids_json = updates.selectedPayloadMediaSetIdsJson;
  }
  if (updates.provenanceJson !== undefined) {
    setClause.push("provenance = $provenance");
    params.$provenance = updates.provenanceJson;
  }
  if (updates.pendingSuggestionsJson !== undefined) {
    setClause.push("pending_suggestions = $pending_suggestions");
    params.$pending_suggestions = updates.pendingSuggestionsJson;
  }
  if (updates.updated_at !== undefined) {
    setClause.push("updated_at = $updated_at");
    params.$updated_at = updates.updated_at;
  } else {
    setClause.push("updated_at = CURRENT_TIMESTAMP");
  }

  return { setClause, params };
}

export function updateEntityByPlan(db: DbClient, plan: UpdatePlan): void {
  if (plan.setClause.length === 0) {
    return;
  }

  db.query(`
    UPDATE entities
    SET ${plan.setClause.join(", ")}
    WHERE id = $id
  `).run(plan.params as Record<string, string | number | null>);
}
