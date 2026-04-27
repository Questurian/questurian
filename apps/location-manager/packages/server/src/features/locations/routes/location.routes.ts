import { app } from "@server/shared/http/server";
import { validateBody, validateParams, validateQuery } from "@server/shared/core/middleware/validation.middleware";
import { errorResponse } from "@shared/types/api-response";
import {
  accommodationsFieldSuggestionSchema,
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
  tourIdParamsSchema,
  updateTourSchema,
} from "../validation/schemas/tours.schemas";
import {
  syncLocationIdSchema,
  syncAllSchema,
  payloadMediaSetsQuerySchema,
} from "../validation/schemas/payload.schemas";
import type { LocationCategory } from "../models/location";
import { getLocationByIdForUpdate } from "../repositories/core";

// Import controllers
import {
  // Core
  getLocations, getLocationsBasic, getLocationById, deleteLocationById,
  refetchPlaceId,
  getTours, getTour, postTour, patchTour, postTourMediaSet,
  getDiningTypes, getAccommodationsTypes, getAttractionsTypes, getNightlifeTypes, getKeyLocationsTypes,
  postAddMaps, patchMapsById, postGooglePrefill, postAccommodationsFieldSuggestion,
  getLocationHierarchy, getCountries, getCountryNames, getCitiesByCountry, getNeighborhoodsByCity,

  // Content
  postAddInstagram, deleteInstagramEmbed,
  postAddUpload, postAddUploadImageSet, postGenerateAltText, postGenerateNeighborhoodDescription, deleteUpload, patchUploadPhotographerCredit, postReprocessUploadVariants, postReplaceUploadVariants,
  serveImage,
  fetchReviews, fetchReviewsPipeline, getReviewsPipelineStatus, downloadReviews, getReviewsStatus,
  fetchTripAdvisorReviews, downloadTripAdvisorReviews, getTripAdvisorReviewsStatus,
  fetchTripAdvisorPlace, downloadTripAdvisorPlace, getTripAdvisorPlaceStatus, downloadLocationExport, downloadAiJson,
  translateAndMergeReviews, downloadMergedReviews, getMergedReviewsStatus, getMergedReviewsReport, downloadRejectsReport,

  // Admin
  clearDatabase, scanOrphanedFiles, cleanupOrphanedFiles,
  getPendingTaxonomy, approveTaxonomy, rejectTaxonomy,
  getAllCorrections, previewCorrection, createCorrection, deleteCorrection,
  getPayloadLocationRefs,
  checkLeadsApiHealth,

  // Integration
  postSyncLocation, postSyncAll, postSyncTour,
  getSyncStatus, getPayloadMediaSets, getTestConnection, deletePayloadSyncState,
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

  // Google Reviews
  app.post(`/api/${category}/:id/reviews/fetch`, routeCategory, validateParams(deleteLocationIdSchema), fetchReviews);
  app.post(`/api/${category}/:id/reviews/fetch-pipeline`, routeCategory, validateParams(deleteLocationIdSchema), fetchReviewsPipeline);
  app.get(`/api/${category}/:id/reviews/pipeline-status`, routeCategory, validateParams(deleteLocationIdSchema), getReviewsPipelineStatus);
  app.get(`/api/${category}/:id/reviews/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadReviews);
  app.get(`/api/${category}/:id/reviews/status`, routeCategory, validateParams(deleteLocationIdSchema), getReviewsStatus);

  // TripAdvisor Reviews
  app.post(`/api/${category}/:id/tripadvisor-reviews/fetch`, routeCategory, validateParams(deleteLocationIdSchema), fetchTripAdvisorReviews);
  app.get(`/api/${category}/:id/tripadvisor-reviews/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadTripAdvisorReviews);
  app.get(`/api/${category}/:id/tripadvisor-reviews/status`, routeCategory, validateParams(deleteLocationIdSchema), getTripAdvisorReviewsStatus);

  // TripAdvisor Place (SerpAPI)
  app.post(`/api/${category}/:id/tripadvisor-place/fetch`, routeCategory, validateParams(deleteLocationIdSchema), fetchTripAdvisorPlace);
  app.get(`/api/${category}/:id/tripadvisor-place/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadTripAdvisorPlace);
  app.get(`/api/${category}/:id/tripadvisor-place/status`, routeCategory, validateParams(deleteLocationIdSchema), getTripAdvisorPlaceStatus);

  // Export (location + TripAdvisor place data)
  app.get(`/api/${category}/:id/export`, routeCategory, validateParams(deleteLocationIdSchema), downloadLocationExport);
  app.get(`/api/${category}/:id/ai-json/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadAiJson);

  // Merged Reviews (translate & merge)
  app.post(`/api/${category}/:id/reviews/translate-merge`, routeCategory, validateParams(deleteLocationIdSchema), translateAndMergeReviews);
  app.get(`/api/${category}/:id/reviews/merged/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadMergedReviews);
  app.get(`/api/${category}/:id/reviews/merged/status`, routeCategory, validateParams(deleteLocationIdSchema), getMergedReviewsStatus);
  app.get(`/api/${category}/:id/reviews/merged/report`, routeCategory, validateParams(deleteLocationIdSchema), getMergedReviewsReport);
  app.get(`/api/${category}/:id/reviews/rejects/download`, routeCategory, validateParams(deleteLocationIdSchema), downloadRejectsReport);
}

app.post("/api/generate-alt-text", postGenerateAltText);
app.post(
  "/api/accommodations/field-suggestions",
  validateBody(accommodationsFieldSuggestionSchema),
  postAccommodationsFieldSuggestion
);
app.delete(
  "/api/uploads/:id",
  validateParams(deleteUploadParamsSchema),
  deleteUpload
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

// Health check routes
app.get("/api/health/leads-api", checkLeadsApiHealth);

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

// Serve uploaded images
app.get("/api/images/*", serveImage);
