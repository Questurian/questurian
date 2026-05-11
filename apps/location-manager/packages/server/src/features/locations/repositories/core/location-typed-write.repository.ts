import type { Location, LocationCategory } from "../../models/location";
import { getTypedTable } from "./location-category.utils";
import type { DbClient, TypedLocationParams, UpdatePlan } from "./location-write.types";

export function upsertTypedRow(
  db: DbClient,
  entityId: number,
  category: LocationCategory,
  params: TypedLocationParams
): void {
  const table = getTypedTable(category);
  db.query(`
    INSERT INTO ${table} (
      entity_id,
      type,
      hours_json,
      ideal_for_json,
      nightlife_details_json,
      accommodations_details_json,
      attractions_details_json,
      key_locations_details_json,
      tripadvisor_meal_types,
      tripadvisor_cuisines,
      tripadvisor_features,
      menu_url,
      reservation_url,
      price_level
    )
    VALUES (
      $entity_id,
      $type,
      $hours_json,
      $ideal_for_json,
      $nightlife_details_json,
      $accommodations_details_json,
      $attractions_details_json,
      $key_locations_details_json,
      $tripadvisor_meal_types,
      $tripadvisor_cuisines,
      $tripadvisor_features,
      $menu_url,
      $reservation_url,
      $price_level
    )
    ON CONFLICT(entity_id) DO UPDATE SET
      type = excluded.type,
      hours_json = excluded.hours_json,
      ideal_for_json = excluded.ideal_for_json,
      nightlife_details_json = excluded.nightlife_details_json,
      accommodations_details_json = excluded.accommodations_details_json,
      attractions_details_json = excluded.attractions_details_json,
      key_locations_details_json = excluded.key_locations_details_json,
      tripadvisor_meal_types = excluded.tripadvisor_meal_types,
      tripadvisor_cuisines = excluded.tripadvisor_cuisines,
      tripadvisor_features = excluded.tripadvisor_features,
      menu_url = excluded.menu_url,
      reservation_url = excluded.reservation_url,
      price_level = excluded.price_level
  `).run({
    $entity_id: entityId,
    $type: params.type ?? null,
    $hours_json: params.hoursJson ?? null,
    $ideal_for_json: params.idealForJson ?? null,
    $nightlife_details_json: params.nightlifeDetailsJson ?? null,
    $accommodations_details_json: params.accommodationsDetailsJson ?? null,
    $attractions_details_json: params.attractionsDetailsJson ?? null,
    $key_locations_details_json: params.keyLocationsDetailsJson ?? null,
    $tripadvisor_meal_types: params.tripadvisorMealTypesJson ?? null,
    $tripadvisor_cuisines: params.tripadvisorCuisinesJson ?? null,
    $tripadvisor_features: params.tripadvisorFeaturesJson ?? null,
    $menu_url: params.menuUrl ?? null,
    $reservation_url: params.reservationUrl ?? null,
    $price_level: params.priceLevel ?? null,
  });
}

export function clearTypedRowsForEntity(db: DbClient, entityId: number): void {
  db.run("DELETE FROM dining_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM nightlife_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM accommodations_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM attractions_locations WHERE entity_id = ?", [entityId]);
  db.run("DELETE FROM key_locations_locations WHERE entity_id = ?", [entityId]);
}

export function buildTypedUpdatePlan(id: number, updates: Partial<Location>): UpdatePlan {
  const setClause: string[] = [];
  const params: Record<string, unknown> = { $entity_id: id };

  if (updates.type !== undefined) {
    setClause.push("type = $type");
    params.$type = updates.type;
  }
  if (updates.hoursJson !== undefined) {
    setClause.push("hours_json = $hours_json");
    params.$hours_json = updates.hoursJson;
  }
  if (updates.idealForJson !== undefined) {
    setClause.push("ideal_for_json = $ideal_for_json");
    params.$ideal_for_json = updates.idealForJson;
  }
  if (updates.nightlifeDetailsJson !== undefined) {
    setClause.push("nightlife_details_json = $nightlife_details_json");
    params.$nightlife_details_json = updates.nightlifeDetailsJson;
  }
  if (updates.accommodationsDetailsJson !== undefined) {
    setClause.push("accommodations_details_json = $accommodations_details_json");
    params.$accommodations_details_json = updates.accommodationsDetailsJson;
  }
  if (updates.attractionsDetailsJson !== undefined) {
    setClause.push("attractions_details_json = $attractions_details_json");
    params.$attractions_details_json = updates.attractionsDetailsJson;
  }
  if (updates.keyLocationsDetailsJson !== undefined) {
    setClause.push("key_locations_details_json = $key_locations_details_json");
    params.$key_locations_details_json = updates.keyLocationsDetailsJson;
  }
  if (updates.tripadvisorMealTypesJson !== undefined) {
    setClause.push("tripadvisor_meal_types = $tripadvisor_meal_types");
    params.$tripadvisor_meal_types = updates.tripadvisorMealTypesJson;
  }
  if (updates.tripadvisorCuisinesJson !== undefined) {
    setClause.push("tripadvisor_cuisines = $tripadvisor_cuisines");
    params.$tripadvisor_cuisines = updates.tripadvisorCuisinesJson;
  }
  if (updates.tripadvisorFeaturesJson !== undefined) {
    setClause.push("tripadvisor_features = $tripadvisor_features");
    params.$tripadvisor_features = updates.tripadvisorFeaturesJson;
  }
  if (updates.menuUrl !== undefined) {
    setClause.push("menu_url = $menu_url");
    params.$menu_url = updates.menuUrl;
  }
  if (updates.reservationUrl !== undefined) {
    setClause.push("reservation_url = $reservation_url");
    params.$reservation_url = updates.reservationUrl;
  }
  if (updates.priceLevel !== undefined) {
    setClause.push("price_level = $price_level");
    params.$price_level = updates.priceLevel;
  }

  return { setClause, params };
}

export function updateTypedRowByPlan(
  db: DbClient,
  category: LocationCategory,
  plan: UpdatePlan
): void {
  if (plan.setClause.length === 0) {
    return;
  }

  const typedTable = getTypedTable(category);
  db.query(`
    UPDATE ${typedTable}
    SET ${plan.setClause.join(", ")}
    WHERE entity_id = $entity_id
  `).run(plan.params as Record<string, string | number | null>);
}
