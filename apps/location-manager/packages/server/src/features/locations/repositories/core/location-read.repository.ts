import { getDb } from "@server/shared/db/client";
import type { Location, LocationCategory } from "../../models/location";
import { parseCategory } from "./location-category.utils";
import { buildLocationRowWithCountsQuery } from "./location-query.utils";
import { LOCATION_SELECT } from "./location-sql.constants";

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

export function getLocationBySlug(slug: string): Location | null {
  const db = getDb();
  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE e.slug = $slug
  `);
  const row = query.get({ $slug: slug }) as Location | undefined;
  return row || null;
}
