import { getDb } from "@server/shared/db/client";
import type { LocationHierarchy } from "../../../models/location";
import type { LocationHierarchyDbRow } from "./types";

export function getAllLocationHierarchy(): LocationHierarchy[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey
    FROM location_taxonomy
    WHERE status = 'approved'
    ORDER BY locationKey
  `);
  return query.all() as LocationHierarchy[];
}

export function taxonomyEntryExists(locationKey: string): boolean {
  const db = getDb();
  const query = db.query(`
    SELECT COUNT(*) as count
    FROM location_taxonomy
    WHERE locationKey = $locationKey
  `);
  const result = query.get({ $locationKey: locationKey }) as { count: number };
  return result.count > 0;
}

export function getTaxonomyEntry(locationKey: string): LocationHierarchy | null {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey, status, created_at
    FROM location_taxonomy
    WHERE locationKey = $locationKey
  `);
  const row = query.get({ $locationKey: locationKey }) as
    | LocationHierarchyDbRow
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    country: row.country,
    city: row.city,
    neighborhood: row.neighborhood,
    locationKey: row.locationKey,
    status: row.status as "approved" | "pending" | undefined,
    created_at: row.created_at,
  };
}

export function getPendingTaxonomyEntries(): LocationHierarchy[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, country, city, neighborhood, locationKey, created_at
    FROM location_taxonomy
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `);
  const rows = query.all() as LocationHierarchyDbRow[];

  return rows.map((row) => ({
    id: row.id,
    country: row.country,
    city: row.city,
    neighborhood: row.neighborhood,
    locationKey: row.locationKey,
    status: "pending" as const,
    created_at: row.created_at,
  }));
}

export function getLocationCountByTaxonomy(locationKey: string): number {
  const db = getDb();
  const query = db.query(`
    SELECT COUNT(*) as count
    FROM entities
    WHERE locationKey = $locationKey
  `);
  const result = query.get({ $locationKey: locationKey }) as { count: number };
  return result.count;
}
