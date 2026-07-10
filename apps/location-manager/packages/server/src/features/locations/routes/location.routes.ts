import { app } from "@server/shared/http/server";
import { validateBody, validateParams, validateQuery } from "@server/shared/core/middleware/validation.middleware";
import { errorResponse } from "@shared/types/api-response";
import {
  fieldSuggestionSchema,
  createMapsSchema,
  googlePrefillSchema,
  patchMapsSchema,
} from "../validation/schemas/maps.schemas";
import { addInstagramSchema, addInstagramParamsSchema, deleteInstagramEmbedParamsSchema } from "../validation/schemas/instagram.schemas";
import {
  addUploadParamsSchema,
  deleteUploadParamsSchema,
  updateUploadPhotographerCreditBodySchema,
} from "../validation/schemas/uploads.schemas";
import { listLocationsQuerySchema, deleteLocationIdSchema } from "../validation/schemas/locations.schemas";
import { taxonomyLocationKeyParamsSchema } from "../validation/schemas/taxonomy.schemas";
import { createCorrectionSchema, deleteCorrectionParamsSchema } from "../validation/schemas/taxonomy-correction.schemas";
import {
  createTourSchema,
  listToursQuerySchema,
  tourImportPreviewSchema,
  tourIdParamsSchema,
  tourSourceImageQuerySchema,
  tourTitleSuggestionSchema,
  updateTourSchema,
} from "../validation/schemas/tours.schemas";
import {
  syncLocationIdSchema,
  syncAllSchema,
  payloadMediaSetsQuerySchema,
} from "../validation/schemas/payload.schemas";
import { locationsByPayloadRefsSchema } from "../validation/schemas/payload-refs.schemas";
import type { LocationCategory } from "../models/location";
import { getLocationByIdForUpdate } from "../repositories/core";

// Import controllers
import {
  // Core
  getLocations, getLocationsBasic, getLocationById, deleteLocationById,
  refetchPlaceId,
  getTours, getTour, postTour, patchTour, postTourMediaSet, postTourImportPreview,
  postTourTitleSuggestion, getTourSourceImage,
  getDiningTypes, getAccommodationsTypes, getAttractionsTypes, getNightlifeTypes, getKeyLocationsTypes,
  postAddMaps, postAddMapsWithPhotos, patchMapsById, postGooglePrefill, postFieldSuggestion,
  postPendingSuggestionAccept, postPendingSuggestionDismiss, postPendingSuggestionPropose,
  getLocationHierarchy, getCountries, getCountryNames, getCitiesByCountry, getNeighborhoodsByCity,

  // Content
  postAddInstagram, deleteInstagramEmbed, retryInstagramMediaStaging,
  postAddUpload, postAddUploadImageSet, postGenerateAltText, postGenerateNeighborhoodDescription, deleteUpload, patchUploadPhotographerCredit, postReprocessUploadVariants, postReplaceUploadVariants,
  serveImage,
  fetchTripAdvisorPlace, downloadTripAdvisorPlace, getTripAdvisorPlaceStatus, downloadLocationExport,

  // Admin
  clearDatabase, scanOrphanedFiles, cleanupOrphanedFiles,
  getAppSettings, putAppSetting,
  getPendingTaxonomy, approveTaxonomy, rejectTaxonomy,
  getAllCorrections, previewCorrection, createCorrection, deleteCorrection,
  getPayloadLocationRefs,

  // Integration
  postSyncLocation, postSyncAll, postSyncTour,
  getSyncStatus, getPayloadMediaSets, getTestConnection, deletePayloadSyncState,
  postLocationsByPayloadRefs,

  // Photo Import flow
  getPhotoImportPreview, getPhotoImportPreviewByPlace, getPhotoImportProxy, postPhotoImportStart, getPhotoImportSources,
  postPhotoImportReject, postPhotoImportUnreject, postPhotoImportRetry, deleteStagedSource,
} from "../controllers";

const CATEGORY_ROUTES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

function withRouteCategory(category: LocationCategory) {
  return async (c: any, next: any) => {
    c.set("routeCategory", category);

    const rawId = c.req.param("id");
    if (rawId !== undefined) {
      const id = Number(rawId);
      if (!Number.isNaN(id) && id > 0) {
        const location = getLocationByIdForUpdate(id);
        if (!location || location.category !== category) {
          return c.json(errorResponse("Location not found"), 404);
        }
      }
    }

    await next();
  };
}

for (const category of CATEGORY_ROUTES) {
  const routeCategory = withRouteCategory(category);

  // Category-specific CRUD
  app.get(`/api/${category}`, routeCategory, validateQuery(listLocationsQuerySchema), getLocations);
  app.get(`/api/${category}-basic`, routeCategory, validateQuery(listLocationsQuerySchema), getLocationsBasic);
  app.get(`/api/${category}/:id`, routeCategory, validateParams(deleteLocationIdSchema), getLocationById);
  app.post(`/api/${category}`, routeCategory, validateBody(createMapsSchema), postAddMaps);
  // ADR-0007: multipart variant for Add flows that bundle pre-cropped Google photos.
  // Skips the JSON body validator — controller parses + validates the embedded JSON payload itself.
  app.post(`/api/${category}/with-photos`, routeCategory, postAddMapsWithPhotos);
  app.post(`/api/${category}/google-prefill`, routeCategory, validateBody(googlePrefillSchema), postGooglePrefill);
  app.patch(`/api/${category}/:id`, routeCategory, validateBody(patchMapsSchema), patchMapsById);
  app.delete(`/api/${category}/:id`, routeCategory, validateParams(deleteLocationIdSchema), deleteLocationById);
  app.post(
    `/api/${category}/:id/refetch-place-id`,
    routeCategory,
    validateParams(deleteLocationIdSchema),
    refetchPlaceId
  );

  // Category-specific content
  app.post(
    `/api/${category}/:id/instagram`,
    routeCategory,
    validateParams(addInstagramParamsSchema),
    validateBody(addInstagramSchema),
    postAddInstagram
  );
  app.post(
    `/api/${category}/:id/uploads`,
    routeCategory,
    validateParams(addUploadParamsSchema),
    postAddUpload
  );
  app.post(
    `/api/${category}/:id/uploads/imageset`,
    routeCategory,
    validateParams(addUploadParamsSchema),
    postAddUploadImageSet
  );
  app.post(
    `/api/${category}/:id/neighborhood-description/generate`,
    routeCategory,
    validateParams(deleteLocationIdSchema),
    postGenerateNeighborhoodDescription
  );

  // TripAdvisor Place (SerpAPI) — used for Stage 1 dining auto-fill (canonical TA URL lookup)
  app.post(`/api/${category}/:id/tripadvisor-place/fetch`, routeCategory, validateParams(deleteLocationIdSchema), fetchTripAdvisorPlace);
  app.get(`/api/${category}/:id/tripadvisor-place/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadTripAdvisorPlace);
  app.get(`/api/${category}/:id/tripadvisor-place/status`, routeCategory, validateParams(deleteLocationIdSchema), getTripAdvisorPlaceStatus);

  // Export (location + TripAdvisor place data)
  app.get(`/api/${category}/:id/export`, routeCategory, validateParams(deleteLocationIdSchema), downloadLocationExport);
}

// Photo Import flow — see ADR-0006 (operator-staged), ADR-0007 (Add-flow pre-Create), LM CONTEXT.md "Photo Import flow"
app.get("/api/photo-import/preview-by-place", getPhotoImportPreviewByPlace);
app.get("/api/photo-import/proxy", getPhotoImportProxy);
app.get("/api/locations/:id/photo-import/preview", getPhotoImportPreview);
app.post("/api/locations/:id/photo-import/start", postPhotoImportStart);
app.get("/api/locations/:id/photo-import/sources", getPhotoImportSources);
app.post("/api/locations/:id/photo-import/reject", postPhotoImportReject);
app.post("/api/locations/:id/photo-import/unreject", postPhotoImportUnreject);
app.post("/api/uploads/:id/photo-import/retry", postPhotoImportRetry);
app.delete("/api/uploads/:id/staged-source", deleteStagedSource);

app.post("/api/generate-alt-text", postGenerateAltText);
app.post(
  "/api/field-suggestions",
  validateBody(fieldSuggestionSchema),
  postFieldSuggestion
);
app.post(
  "/api/dining/:id/pending-suggestions/accept",
  validateParams(deleteLocationIdSchema),
  postPendingSuggestionAccept
);
app.post(
  "/api/dining/:id/pending-suggestions/dismiss",
  validateParams(deleteLocationIdSchema),
  postPendingSuggestionDismiss
);
app.post(
  "/api/locations/:id/pending-suggestions/propose",
  validateParams(deleteLocationIdSchema),
  postPendingSuggestionPropose
);
app.delete(
  "/api/uploads/:id",
  validateParams(deleteUploadParamsSchema),
  deleteUpload
);
app.post(
  "/api/instagram-embeds/:id/staging/retry",
  validateParams(deleteInstagramEmbedParamsSchema),
  retryInstagramMediaStaging,
);
app.patch(
  "/api/uploads/:id/photographer-credit",
  validateParams(deleteUploadParamsSchema),
  validateBody(updateUploadPhotographerCreditBodySchema),
  patchUploadPhotographerCredit
);
app.post(
  "/api/uploads/:id/reprocess-variants",
  validateParams(deleteUploadParamsSchema),
  postReprocessUploadVariants
);
app.post(
  "/api/uploads/:id/replace-variants",
  validateParams(deleteUploadParamsSchema),
  postReplaceUploadVariants
);
app.delete(
  "/api/instagram-embeds/:id",
  validateParams(deleteInstagramEmbedParamsSchema),
  deleteInstagramEmbed
);
app.get("/api/clear-db", clearDatabase);

app.get("/api/tours", validateQuery(listToursQuerySchema), getTours);
app.post("/api/tours/import/preview", validateBody(tourImportPreviewSchema), postTourImportPreview);
app.post("/api/tours/import/title-suggestion", validateBody(tourTitleSuggestionSchema), postTourTitleSuggestion);
app.get("/api/tours/import/source-image", validateQuery(tourSourceImageQuerySchema), getTourSourceImage);
app.get("/api/tours/:id", validateParams(tourIdParamsSchema), getTour);
app.post("/api/tours", validateBody(createTourSchema), postTour);
app.post("/api/tours/media-set", postTourMediaSet);
app.patch(
  "/api/tours/:id",
  validateParams(tourIdParamsSchema),
  validateBody(updateTourSchema),
  patchTour
);

// Admin orphan cleanup routes
app.get("/api/admin/orphaned-files", scanOrphanedFiles);
app.post("/api/admin/orphaned-files/cleanup", cleanupOrphanedFiles);

// App settings (Integration Toggles)
app.get("/api/admin/settings", getAppSettings);
app.put("/api/admin/settings/:key", putAppSetting);

// Admin payload location refs route
app.get("/api/admin/payload-location-refs", getPayloadLocationRefs);

// Location hierarchy API routes
app.get("/api/location-hierarchy", getLocationHierarchy);
app.get("/api/location-hierarchy/countries", getCountries);
app.get("/api/countries", getCountryNames);
app.get("/api/location-hierarchy/cities/:country", getCitiesByCountry);
app.get("/api/location-hierarchy/neighborhoods/:country/:city", getNeighborhoodsByCity);

// Location type routes
app.get("/api/dining-types", getDiningTypes);
app.get("/api/accommodations-types", getAccommodationsTypes);
app.get("/api/attractions-types", getAttractionsTypes);
app.get("/api/nightlife-types", getNightlifeTypes);
app.get("/api/key-locations-types", getKeyLocationsTypes);

// Admin taxonomy routes
app.get("/api/admin/taxonomy/pending", getPendingTaxonomy);
app.patch(
  "/api/admin/taxonomy/:locationKey/approve",
  validateParams(taxonomyLocationKeyParamsSchema),
  approveTaxonomy
);
app.delete(
  "/api/admin/taxonomy/:locationKey/reject",
  validateParams(taxonomyLocationKeyParamsSchema),
  rejectTaxonomy
);

// Admin taxonomy correction routes
app.get("/api/admin/taxonomy/corrections", getAllCorrections);
app.post(
  "/api/admin/taxonomy/corrections/preview",
  validateBody(createCorrectionSchema),
  previewCorrection
);
app.post(
  "/api/admin/taxonomy/corrections",
  validateBody(createCorrectionSchema),
  createCorrection
);
app.delete(
  "/api/admin/taxonomy/corrections/:id",
  validateParams(deleteCorrectionParamsSchema),
  deleteCorrection
);

// Payload sync routes
app.post(
  "/api/payload/sync/:id",
  validateParams(syncLocationIdSchema),
  postSyncLocation
);
app.post(
  "/api/payload/sync-all",
  validateBody(syncAllSchema),
  postSyncAll
);
app.post(
  "/api/payload/sync-tour/:id",
  validateParams(tourIdParamsSchema),
  postSyncTour
);
app.get(
  "/api/payload/media-sets",
  validateQuery(payloadMediaSetsQuerySchema),
  getPayloadMediaSets
);
app.get("/api/payload/sync-status", getSyncStatus);
app.get("/api/payload/sync-status/:id", getSyncStatus);
app.get("/api/payload/test-connection", getTestConnection);
app.delete("/api/payload/sync-state", deletePayloadSyncState);
app.post(
  "/api/payload/locations/by-refs",
  validateBody(locationsByPayloadRefsSchema),
  postLocationsByPayloadRefs
);

// Serve uploaded images
app.get("/api/images/*", serveImage);
