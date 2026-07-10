import type { Database } from "bun:sqlite";

type EmbedRow = {
  id: number;
  entity_id: number;
  url: string;
  images: string | null;
};

function normalizePostUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}/`;
  } catch {
    return value.split(/[?#]/, 1)[0]!.replace(/\/+$/, "") + "/";
  }
}

function imageCount(value: string | null): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function addColumn(db: Database, table: string, columns: Set<string>, name: string, sqlType: string): void {
  if (!columns.has(name)) db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${sqlType}`);
}

export function addInstagramImageStaging(db: Database): void {
  const embedColumns = new Set(
    (db.query("PRAGMA table_info(instagram_embeds)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  addColumn(db, "instagram_embeds", embedColumns, "media_staging_status", "TEXT");
  addColumn(db, "instagram_embeds", embedColumns, "media_staging_error", "TEXT");
  addColumn(db, "instagram_embeds", embedColumns, "media_item_count", "INTEGER");
  addColumn(db, "instagram_embeds", embedColumns, "staged_item_count", "INTEGER");

  const uploadColumns = new Set(
    (db.query("PRAGMA table_info(uploads)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  addColumn(db, "uploads", uploadColumns, "source_kind", "TEXT");
  addColumn(db, "uploads", uploadColumns, "instagram_embed_id", "INTEGER");
  addColumn(db, "uploads", uploadColumns, "instagram_media_key", "TEXT");
  addColumn(db, "uploads", uploadColumns, "source_position", "INTEGER");
  addColumn(db, "uploads", uploadColumns, "source_url", "TEXT");

  db.transaction(() => {
    const rows = db.query("SELECT id, entity_id, url, images FROM instagram_embeds ORDER BY id").all() as EmbedRow[];
    const groups = new Map<string, EmbedRow[]>();
    for (const row of rows) {
      const normalizedUrl = normalizePostUrl(row.url);
      const key = `${row.entity_id}|${normalizedUrl}`;
      groups.set(key, [...(groups.get(key) ?? []), { ...row, url: normalizedUrl }]);
    }

    for (const group of groups.values()) {
      const keep = [...group].sort((a, b) => imageCount(b.images) - imageCount(a.images) || b.id - a.id)[0]!;
      db.query("UPDATE instagram_embeds SET url = $url WHERE id = $id").run({ $id: keep.id, $url: keep.url });
      for (const duplicate of group) {
        if (duplicate.id !== keep.id) {
          db.query("DELETE FROM instagram_embeds WHERE id = $id").run({ $id: duplicate.id });
        }
      }
    }
  })();

  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_embeds_entity_url ON instagram_embeds(entity_id, url)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_instagram_item ON uploads(instagram_embed_id, instagram_media_key)");
  db.run(`CREATE TABLE IF NOT EXISTS rejected_instagram_media (
    instagram_embed_id INTEGER NOT NULL,
    media_key TEXT NOT NULL,
    source_position INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(instagram_embed_id, media_key),
    FOREIGN KEY(instagram_embed_id) REFERENCES instagram_embeds(id) ON DELETE CASCADE
  )`);
}
