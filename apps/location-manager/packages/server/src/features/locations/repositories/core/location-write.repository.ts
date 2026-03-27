import { getDb } from "@server/shared/db/client";
import type { Location } from "../../models/location";
import { parseCategory } from "./location-category.utils";
import {
  buildEntityUpdatePlan,
  findExistingEntityId,
  getEntityCategoryById,
  insertEntity,
  updateEntityByPlan,
  updateExistingEntity,
} from "./location-entity-write.repository";
import {
  buildTypedUpdatePlan,
  clearTypedRowsForEntity,
  updateTypedRowByPlan,
  upsertTypedRow,
} from "./location-typed-write.repository";
import { toTypedLocationParams } from "./location-write.types";

function saveLocationInternal(location: Location): number {
  const db = getDb();
  const category = parseCategory(location.category);
  db.run("BEGIN TRANSACTION");

  try {
    const existingId = findExistingEntityId(db, category, location);
    const entityId = existingId ?? insertEntity(db, category, location);

    if (existingId) {
      updateExistingEntity(db, entityId, location);
    }

    clearTypedRowsForEntity(db, entityId);
    upsertTypedRow(db, entityId, category, toTypedLocationParams(location));

    db.run("COMMIT");
    return entityId;
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export function saveLocationOrThrow(location: Location): number {
  return saveLocationInternal(location);
}

export function saveLocation(location: Location): number | boolean {
  try {
    return saveLocationInternal(location);
  } catch (error) {
    console.error("Error saving location to DB:", error);
    return false;
  }
}

export function updateLocationById(id: number, updates: Partial<Location>): boolean {
  const db = getDb();

  try {
    const category = getEntityCategoryById(db, id);
    if (!category) {
      return false;
    }

    const entityPlan = buildEntityUpdatePlan(id, updates);
    const typedPlan = buildTypedUpdatePlan(id, updates);

    if (entityPlan.setClause.length === 0 && typedPlan.setClause.length === 0) {
      return false;
    }

    db.run("BEGIN TRANSACTION");

    updateEntityByPlan(db, entityPlan);
    updateTypedRowByPlan(db, category, typedPlan);

    db.run("COMMIT");
    return true;
  } catch (error) {
    db.run("ROLLBACK");
    console.error("Error updating location:", error);
    return false;
  }
}
