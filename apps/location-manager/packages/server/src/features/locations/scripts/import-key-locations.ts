import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, initDb } from "@server/shared/db/client";
import { saveLocation } from "../repositories/core/location.repository";
import type { Location } from "../models/location";
import { slugifyLocationPart } from "../services/geocoding/location-key.utils";

type RawKeyLocation = {
  id?: number;
  name?: unknown;
  address?: unknown;
  location_type?: unknown;
  type?: unknown;
  images?: unknown;
  neighborhood?: unknown;
  district?: unknown;
  hours?: unknown;
  operationHours?: unknown;
  phone?: unknown;
  phoneNumber?: unknown;
  website?: unknown;
  tags?: unknown;
  details?: unknown;
  status?: unknown;
  lat?: unknown;
  lng?: unknown;
  placeId?: unknown;
  googleUrl?: unknown;
  url?: unknown;
  locationKey?: unknown;
  ianaTimeId?: unknown;
  countryCode?: unknown;
  tripadvisorUrl?: unknown;
};

function getArgValue(prefix: string): string | null {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function normalizeOperationHours(raw: RawKeyLocation): Record<string, unknown> | null {
  return parseJsonRecord(raw.hours) || parseJsonRecord(raw.operationHours);
}

function normalizeLocationType(raw: RawKeyLocation): string | null {
  return asString(raw.location_type) || asString(raw.type);
}

function normalizeDistrict(raw: RawKeyLocation): string | null {
  return asString(raw.neighborhood) || asString(raw.district);
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null)
  );
}

function resolveSeedFilePath(fileArg?: string | null): string {
  if (fileArg) {
    return isAbsolute(fileArg)
      ? fileArg
      : resolve(process.cwd(), fileArg);
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(currentDir, "../../../../");
  return resolve(serverRoot, "data/seeds/key-locations.raw.json");
}

function buildFallbackLocationKey(district: string | null): string {
  if (district) {
    return `peru|lima|${slugifyLocationPart(district)}`;
  }
  return "peru|lima";
}

function normalizeEntry(rawEntry: RawKeyLocation, index: number): Location | null {
  const sourceId = rawEntry.id ?? index + 1;
  const name = asString(rawEntry.name);
  const address = asString(rawEntry.address);

  if (!name || !address) {
    console.warn(`[SKIP] #${sourceId}: missing required name/address`);
    return null;
  }

  const district = normalizeDistrict(rawEntry);
  const locationType = normalizeLocationType(rawEntry);
  const operationHours = normalizeOperationHours(rawEntry);
  const phoneNumber = asString(rawEntry.phoneNumber) || asString(rawEntry.phone);
  const website = asString(rawEntry.website);
  const details = parseJsonRecord(rawEntry.details) || {};
  const tags = parseStringList(rawEntry.tags);
  const images = parseStringList(rawEntry.images);
  const status = (asString(rawEntry.status) || "active").toLowerCase();
  const countryCode = (asString(rawEntry.countryCode) || "PE").toUpperCase();
  const ianaTimeId = asString(rawEntry.ianaTimeId) || "America/Lima";
  const locationKey = asString(rawEntry.locationKey) || buildFallbackLocationKey(district);
  const lat = asNumber(rawEntry.lat);
  const lng = asNumber(rawEntry.lng);
  const placeId = asString(rawEntry.placeId);
  const tripadvisorUrl = asString(rawEntry.tripadvisorUrl);
  const googleUrl =
    asString(rawEntry.url) ||
    asString(rawEntry.googleUrl) ||
    `https://maps.google.com/?q=${encodeURIComponent(`${name} ${address}`)}`;

  const keyLocationsDetails = compactRecord({
    location_type: locationType,
    neighborhood: district,
    hours: operationHours,
    phone: phoneNumber,
    website,
    tags: tags.length > 0 ? tags : undefined,
    details,
    status,
    images: images.length > 0 ? images : undefined,
  });

  return {
    name,
    title: name,
    address,
    category: "key_locations",
    type: locationType,
    locationKey,
    district,
    contactAddress: address,
    countryCode,
    ianaTimeId,
    phoneNumber,
    website,
    url: googleUrl,
    lat,
    lng,
    placeId,
    tripadvisorUrl,
    hoursJson: operationHours ? JSON.stringify(operationHours) : null,
    keyLocationsDetailsJson: JSON.stringify(keyLocationsDetails),
  };
}

function isExistingKeyLocation(name: string, address: string): { id: number } | null {
  const db = getDb();
  return (
    (db.query(`
      SELECT id
      FROM entities
      WHERE category = 'key_locations'
        AND name = $name
        AND address = $address
      LIMIT 1
    `).get({ $name: name, $address: address }) as { id: number } | null) || null
  );
}

function loadRawEntries(seedPath: string): RawKeyLocation[] {
  const rawContent = readFileSync(seedPath, "utf8");
  const parsed = JSON.parse(rawContent);
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file must contain an array: ${seedPath}`);
  }
  return parsed as RawKeyLocation[];
}

function importKeyLocations() {
  const dryRun = process.argv.includes("--dry-run");
  const limitValue = getArgValue("--limit=");
  const fileArg = getArgValue("--file=");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : null;

  if (limitValue && Number.isNaN(limit)) {
    throw new Error(`Invalid --limit value: ${limitValue}`);
  }

  const seedPath = resolveSeedFilePath(fileArg);
  const rawEntries = loadRawEntries(seedPath);
  const targetEntries = limit ? rawEntries.slice(0, limit) : rawEntries;

  initDb();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log("\nImporting key locations");
  console.log(`  Seed file: ${seedPath}`);
  console.log(`  Entries loaded: ${rawEntries.length}`);
  console.log(`  Entries to process: ${targetEntries.length}`);
  console.log(`  Dry run: ${dryRun ? "yes" : "no"}\n`);

  targetEntries.forEach((entry, index) => {
    const normalized = normalizeEntry(entry, index);
    const sourceId = entry.id ?? index + 1;
    if (!normalized) {
      skipped += 1;
      return;
    }

    const existing = isExistingKeyLocation(normalized.name, normalized.address);
    const action = existing ? "update" : "create";

    if (dryRun) {
      console.log(`[DRY] #${sourceId} ${action.toUpperCase()} -> ${normalized.name}`);
      if (!existing) {
        created += 1;
      } else {
        updated += 1;
      }
      return;
    }

    const saveResult = saveLocation(normalized);
    if (!saveResult || typeof saveResult !== "number") {
      failed += 1;
      console.error(`[FAIL] #${sourceId} ${normalized.name}`);
      return;
    }

    if (!existing) {
      created += 1;
      console.log(`[CREATE] #${sourceId} ${normalized.name} -> id ${saveResult}`);
    } else {
      updated += 1;
      console.log(`[UPDATE] #${sourceId} ${normalized.name} -> id ${saveResult}`);
    }
  });

  console.log("\nImport complete");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}\n`);
}

try {
  importKeyLocations();
} catch (error) {
  console.error("Key locations import failed:", error);
  process.exit(1);
}
