import { getDb } from "@server/shared/db/client";

/**
 * Generic key-value store backing Integration Toggles (see LM CONTEXT.md).
 * Booleans are stored as "true"/"false"; a missing row means the caller's
 * default applies.
 */

export function getSettingValue(key: string): string | null {
  const db = getDb();
  const row = db
    .query("SELECT value FROM app_settings WHERE key = $key")
    .get({ $key: key }) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSettingValue(key: string, value: string): void {
  const db = getDb();
  db.query(
    "INSERT INTO app_settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = $value"
  ).run({ $key: key, $value: value });
}

export function getBooleanSetting(key: string, defaultValue: boolean): boolean {
  const raw = getSettingValue(key);
  if (raw === null) return defaultValue;
  return raw === "true";
}

export function setBooleanSetting(key: string, value: boolean): void {
  setSettingValue(key, value ? "true" : "false");
}
