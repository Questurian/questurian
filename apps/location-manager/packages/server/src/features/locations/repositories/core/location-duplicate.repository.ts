import { getDb } from "@server/shared/db/client";
import type { Location } from "../../models/location";
import { LOCATION_SELECT } from "./location-sql.constants";

export function findPotentialDuplicateLocations(params: {
  address: string;
  tripadvisorUrl?: string | null;
  tripadvisorLocationId?: string | null;
}): Location[] {
  const db = getDb();
  const normalizedAddress = params.address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const whereClauses: string[] = [
    "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(e.address), ',', ''), '.', ''), '#', ''), '-', ''), ' ', '')) = $normalized_address",
  ];
  const queryParams: Record<string, string | null> = {
    $normalized_address: normalizedAddress,
  };

  if (params.tripadvisorLocationId) {
    whereClauses.push("e.tripadvisor_location_id = $tripadvisor_location_id");
    queryParams.$tripadvisor_location_id = params.tripadvisorLocationId;
  }

  if (params.tripadvisorUrl) {
    whereClauses.push("e.tripadvisor_url = $tripadvisor_url");
    queryParams.$tripadvisor_url = params.tripadvisorUrl;
  }

  const query = db.query(`
    ${LOCATION_SELECT}
    WHERE ${whereClauses.join(" OR ")}
  `);

  return query.all(queryParams) as Location[];
}
