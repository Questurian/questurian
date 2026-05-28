import type { Database } from "bun:sqlite";

const CATEGORY_VALUES = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
] as const;

/**
 * Renames `reservation_url` → `booking_url` on each `${category}_locations` table.
 * Per ADR-0009, `bookingUrl` is the canonical name for the location-level buy-action CTA
 * across dining, accommodations, attractions, and nightlife (key_locations included for
 * schema uniformity, even though no flow writes to it).
 */
export function renameReservationUrlToBookingUrl(db: Database): void {
  for (const category of CATEGORY_VALUES) {
    const tableName = `${category}_locations`;
    const cols = db
      .query(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));

    if (names.has("reservation_url") && !names.has("booking_url")) {
      try {
        db.run(`ALTER TABLE ${tableName} RENAME COLUMN reservation_url TO booking_url`);
        continue;
      } catch {
        // Some dev DBs contain legacy backup tables with broken foreign keys; SQLite can reject
        // RENAME COLUMN during schema rewrite. Add/copy keeps boot unblocked and preserves data.
        db.run(`ALTER TABLE ${tableName} ADD COLUMN booking_url TEXT`);
      }
    }

    const nextCols = db
      .query(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;
    const nextNames = new Set(nextCols.map((c) => c.name));

    if (nextNames.has("reservation_url") && nextNames.has("booking_url")) {
      db.run(
        `UPDATE ${tableName}
         SET booking_url = reservation_url
         WHERE (booking_url IS NULL OR booking_url = '')
           AND reservation_url IS NOT NULL
           AND reservation_url <> ''`,
      );
    }
  }
}
