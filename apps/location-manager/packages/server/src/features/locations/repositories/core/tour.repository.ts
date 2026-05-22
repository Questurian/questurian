import { getDb } from "@server/shared/db/client";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import type { Tour, TourPayloadSyncState, TourPayloadSyncSummary } from "../../models/location";

type TourRowDb = {
  id: number;
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  locationKey: string | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceImageUrl: string | null;
  sourceProductCode: string | null;
  created_at: string;
  updated_at: string;
  payloadSyncPayloadDocId: string | null;
  payloadSyncLastSyncedAt: string | null;
  payloadSyncStatus: string | null;
  payloadSyncErrorMessage: string | null;
};

function normalizeTourIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

function mapTourRow(row: TourRowDb): Tour {
  const st = row.payloadSyncStatus;
  const payloadSync: TourPayloadSyncSummary | null =
    st === "success" || st === "failed" || st === "pending"
      ? {
          payloadDocId: row.payloadSyncPayloadDocId,
          lastSyncedAt: row.payloadSyncLastSyncedAt,
          syncStatus: st,
          errorMessage: row.payloadSyncErrorMessage,
        }
      : null;

  return {
    id: row.id,
    title: row.title,
    imgPayloadMediaSetId: row.imgPayloadMediaSetId,
    bookingLink: row.bookingLink,
    price: row.price,
    locationKey: row.locationKey,
    sourceProvider: row.sourceProvider,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    sourceImageUrl: row.sourceImageUrl,
    sourceProductCode: row.sourceProductCode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payloadSync,
  };
}

const TOUR_SELECT = `
  SELECT
    tours.id,
    tours.title,
    tours.img_payload_media_set_id as imgPayloadMediaSetId,
    tours.booking_link as bookingLink,
    tours.price,
    tours.location_key as locationKey,
    tours.source_provider as sourceProvider,
    tours.source_url as sourceUrl,
    tours.source_title as sourceTitle,
    tours.source_image_url as sourceImageUrl,
    tours.source_product_code as sourceProductCode,
    tours.created_at,
    tours.updated_at,
    pss.payload_doc_id as payloadSyncPayloadDocId,
    pss.last_synced_at as payloadSyncLastSyncedAt,
    pss.sync_status as payloadSyncStatus,
    pss.error_message as payloadSyncErrorMessage
  FROM tours
  LEFT JOIN tour_payload_sync_state pss ON pss.tour_id = tours.id
`;

export function listTours(params: {
  query?: string;
  ids?: number[];
  limit?: number;
} = {}): Tour[] {
  const db = getDb();
  const ids = normalizeTourIds(params.ids ?? []);

  if (ids.length > 0) {
    const placeholders = ids.map((_, index) => `$id${index}`).join(", ");
    const rows = db
      .query(`${TOUR_SELECT} WHERE tours.id IN (${placeholders})`)
      .all(Object.fromEntries(ids.map((id, index) => [`$id${index}`, id]))) as TourRowDb[];
    const byId = new Map(rows.map((row) => [row.id, mapTourRow(row)]));
    return ids.map((id) => byId.get(id)).filter((row): row is Tour => Boolean(row));
  }

  const query = params.query?.trim() ?? "";
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  if (query) {
    return db
      .query(`
        ${TOUR_SELECT}
        WHERE tours.title LIKE $query
          OR tours.booking_link LIKE $query
          OR tours.price LIKE $query
          OR IFNULL(tours.location_key, '') LIKE $query
          OR IFNULL(tours.source_title, '') LIKE $query
          OR IFNULL(tours.source_provider, '') LIKE $query
        ORDER BY tours.updated_at DESC, tours.id DESC
        LIMIT $limit
      `)
      .all({ $query: `%${query}%`, $limit: limit })
      .map((row) => mapTourRow(row as TourRowDb));
  }

  return db
    .query(`
      ${TOUR_SELECT}
      ORDER BY tours.updated_at DESC, tours.id DESC
      LIMIT $limit
    `)
    .all({ $limit: limit })
    .map((row) => mapTourRow(row as TourRowDb));
}

export function getAllTours(): Tour[] {
  const db = getDb();
  return db
    .query(`
      ${TOUR_SELECT}
      ORDER BY tours.updated_at DESC, tours.id DESC
    `)
    .all()
    .map((row) => mapTourRow(row as TourRowDb));
}

export function getTourById(id: number): Tour | null {
  const db = getDb();
  const row = db.query(`${TOUR_SELECT} WHERE tours.id = $id`).get({ $id: id }) as TourRowDb | null;
  return row ? mapTourRow(row) : null;
}

export function getTourByBookingLink(bookingLink: string): Tour | null {
  const db = getDb();
  const row = db
    .query(`${TOUR_SELECT} WHERE tours.booking_link = $bookingLink LIMIT 1`)
    .get({ $bookingLink: bookingLink }) as TourRowDb | null;
  return row ? mapTourRow(row) : null;
}

export function createTour(data: {
  title: string;
  imgPayloadMediaSetId: string;
  bookingLink: string;
  price: string;
  locationKey?: string | null;
  sourceProvider?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceImageUrl?: string | null;
  sourceProductCode?: string | null;
}): Tour {
  const db = getDb();
  db
    .query(`
      INSERT INTO tours (
        title,
        img_payload_media_set_id,
        booking_link,
        price,
        location_key,
        source_provider,
        source_url,
        source_title,
        source_image_url,
        source_product_code
      )
      VALUES (
        $title,
        $imgPayloadMediaSetId,
        $bookingLink,
        $price,
        $locationKey,
        $sourceProvider,
        $sourceUrl,
        $sourceTitle,
        $sourceImageUrl,
        $sourceProductCode
      )
    `)
    .run({
      $title: data.title,
      $imgPayloadMediaSetId: data.imgPayloadMediaSetId,
      $bookingLink: data.bookingLink,
      $price: data.price,
      $locationKey: data.locationKey?.trim() || null,
      $sourceProvider: data.sourceProvider?.trim() || null,
      $sourceUrl: data.sourceUrl?.trim() || null,
      $sourceTitle: data.sourceTitle?.trim() || null,
      $sourceImageUrl: data.sourceImageUrl?.trim() || null,
      $sourceProductCode: data.sourceProductCode?.trim() || null,
    });

  const row = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  const tour = getTourById(row.id);
  if (!tour) {
    throw new BadRequestError("Failed to create tour");
  }
  return tour;
}

export function updateTour(
  id: number,
  data: Partial<{
    title: string;
    imgPayloadMediaSetId: string;
    bookingLink: string;
    price: string;
    locationKey: string | null;
    sourceProvider: string | null;
    sourceUrl: string | null;
    sourceTitle: string | null;
    sourceImageUrl: string | null;
    sourceProductCode: string | null;
  }>
): Tour {
  const setClause: string[] = [];
  const params: Record<string, string | number | null> = { $id: id };

  if (data.title !== undefined) {
    setClause.push("title = $title");
    params.$title = data.title;
  }
  if (data.imgPayloadMediaSetId !== undefined) {
    setClause.push("img_payload_media_set_id = $imgPayloadMediaSetId");
    params.$imgPayloadMediaSetId = data.imgPayloadMediaSetId;
  }
  if (data.bookingLink !== undefined) {
    setClause.push("booking_link = $bookingLink");
    params.$bookingLink = data.bookingLink;
  }
  if (data.price !== undefined) {
    setClause.push("price = $price");
    params.$price = data.price;
  }
  if (data.locationKey !== undefined) {
    setClause.push("location_key = $locationKey");
    const raw = data.locationKey;
    params.$locationKey = raw === null || raw === "" ? null : raw.trim();
  }
  if (data.sourceProvider !== undefined) {
    setClause.push("source_provider = $sourceProvider");
    params.$sourceProvider = data.sourceProvider?.trim() || null;
  }
  if (data.sourceUrl !== undefined) {
    setClause.push("source_url = $sourceUrl");
    params.$sourceUrl = data.sourceUrl?.trim() || null;
  }
  if (data.sourceTitle !== undefined) {
    setClause.push("source_title = $sourceTitle");
    params.$sourceTitle = data.sourceTitle?.trim() || null;
  }
  if (data.sourceImageUrl !== undefined) {
    setClause.push("source_image_url = $sourceImageUrl");
    params.$sourceImageUrl = data.sourceImageUrl?.trim() || null;
  }
  if (data.sourceProductCode !== undefined) {
    setClause.push("source_product_code = $sourceProductCode");
    params.$sourceProductCode = data.sourceProductCode?.trim() || null;
  }

  if (setClause.length === 0) {
    const current = getTourById(id);
    if (!current) throw new NotFoundError("Tour", id);
    return current;
  }

  const db = getDb();
  db
    .query(`
      UPDATE tours
      SET ${setClause.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $id
    `)
    .run(params);

  const tour = getTourById(id);
  if (!tour) throw new NotFoundError("Tour", id);
  return tour;
}

export function getAttractionTours(attractionId: number): Tour[] {
  const db = getDb();
  return db
    .query(`
      ${TOUR_SELECT}
      INNER JOIN attraction_tours at ON at.tour_id = tours.id
      WHERE at.attraction_entity_id = $attractionId
      ORDER BY at.sort_order ASC, at.created_at ASC
    `)
    .all({ $attractionId: attractionId })
    .map((row) => mapTourRow(row as TourRowDb));
}

export function setAttractionTours(attractionId: number, tourIds: number[]): Tour[] {
  const normalizedIds = normalizeTourIds(tourIds);
  const db = getDb();

  const location = db
    .query("SELECT id, category FROM entities WHERE id = $id")
    .get({ $id: attractionId }) as { id: number; category: string } | undefined;

  if (!location || location.category !== "attractions") {
    throw new NotFoundError("Attraction", attractionId);
  }

  const existingTours = normalizedIds.length > 0 ? listTours({ ids: normalizedIds }) : [];
  if (existingTours.length !== normalizedIds.length) {
    throw new BadRequestError("One or more selected tours do not exist");
  }

  db.run("BEGIN TRANSACTION");
  try {
    db
      .query("DELETE FROM attraction_tours WHERE attraction_entity_id = $attractionId")
      .run({ $attractionId: attractionId });

    const insert = db.query(`
      INSERT INTO attraction_tours (attraction_entity_id, tour_id, sort_order)
      VALUES ($attractionId, $tourId, $sortOrder)
    `);

    normalizedIds.forEach((tourId, index) => {
      insert.run({
        $attractionId: attractionId,
        $tourId: tourId,
        $sortOrder: index,
      });
    });

    db
      .query("UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = $attractionId")
      .run({ $attractionId: attractionId });

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  return getAttractionTours(attractionId);
}

export function getTourSyncState(tourId: number): TourPayloadSyncState | null {
  const db = getDb();
  return db
    .query(`
      SELECT
        id,
        tour_id as tourId,
        payload_doc_id as payloadDocId,
        last_synced_at as lastSyncedAt,
        sync_status as syncStatus,
        error_message as errorMessage
      FROM tour_payload_sync_state
      WHERE tour_id = $tourId
    `)
    .get({ $tourId: tourId }) as TourPayloadSyncState | null;
}

export function saveTourSyncState(
  tourId: number,
  payloadDocId: string,
  status: "success" | "failed" | "pending",
  errorMessage?: string,
  timestamp?: string
): boolean {
  try {
    const db = getDb();
    const syncTimestamp = timestamp || new Date().toISOString();
    db
      .query(`
        INSERT INTO tour_payload_sync_state (tour_id, payload_doc_id, last_synced_at, sync_status, error_message)
        VALUES ($tourId, $payloadDocId, $timestamp, $status, $errorMessage)
        ON CONFLICT(tour_id) DO UPDATE SET
          payload_doc_id = CASE WHEN excluded.sync_status = 'success' THEN excluded.payload_doc_id ELSE tour_payload_sync_state.payload_doc_id END,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          error_message = excluded.error_message
      `)
      .run({
        $tourId: tourId,
        $payloadDocId: payloadDocId,
        $timestamp: syncTimestamp,
        $status: status,
        $errorMessage: errorMessage || null,
      });
    return true;
  } catch (error) {
    console.error("Error saving tour sync state:", error);
    return false;
  }
}
