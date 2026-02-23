import { getDb } from "@server/shared/db/client";

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
