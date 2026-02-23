import { LOCATION_FROM_AND_JOINS, LOCATION_SELECT_COLUMNS } from "./location-sql.constants";

export function buildLocationRowWithCountsQuery(whereClause: string): string {
  return `
    SELECT
      ${LOCATION_SELECT_COLUMNS},
      (SELECT COUNT(*) FROM uploads u WHERE u.entity_id = e.id) as uploadsCount,
      (SELECT COUNT(*) FROM instagram_embeds ie WHERE ie.entity_id = e.id) as instagramEmbedsCount
    ${LOCATION_FROM_AND_JOINS}
    ${whereClause}
  `;
}
