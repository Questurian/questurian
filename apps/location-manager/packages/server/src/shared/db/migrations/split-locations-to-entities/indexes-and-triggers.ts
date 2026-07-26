import type { Database } from "bun:sqlite";

export function ensureEntityIndexesAndTriggers(db: Database): void {
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category)");
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_location_key ON entities(locationKey)");
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_updated_at ON entities(updated_at)");

  db.run("CREATE INDEX IF NOT EXISTS idx_uploads_entity_id ON uploads(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_instagram_embeds_entity_id ON instagram_embeds(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tripadvisor_places_entity_id ON tripadvisor_places(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_entity ON payload_sync_state(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_status ON payload_sync_state(sync_status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_collection ON payload_sync_state(payload_collection)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tours_updated_at ON tours(updated_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attraction_tours_attraction ON attraction_tours(attraction_entity_id, sort_order)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attraction_tours_tour ON attraction_tours(tour_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tour_payload_sync_status ON tour_payload_sync_state(sync_status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_corrections_lookup ON taxonomy_corrections(incorrect_value, part_type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_location_taxonomy_status_key ON location_taxonomy(status, locationKey)");

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_insert
    AFTER INSERT ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_update
    AFTER UPDATE ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_delete
    AFTER DELETE ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_insert
    AFTER INSERT ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_update
    AFTER UPDATE ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_delete
    AFTER DELETE ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_insert
    AFTER INSERT ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_update
    AFTER UPDATE ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_delete
    AFTER DELETE ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_tours_update
    AFTER UPDATE ON tours
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE tours SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_attraction_tours_insert
    AFTER INSERT ON attraction_tours
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.attraction_entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_attraction_tours_delete
    AFTER DELETE ON attraction_tours
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.attraction_entity_id;
    END;
  `);

  db.run(`
    INSERT OR IGNORE INTO taxonomy_corrections (incorrect_value, correct_value, part_type)
    VALUES ('bras-lia', 'brasilia', 'city')
  `);
}
