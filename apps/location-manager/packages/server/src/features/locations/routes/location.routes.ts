import { app } from "@server/shared/http/server";
import { validateBody, validateParams, validateQuery } from "@server/shared/core/middleware/validation.middleware";
import { createMapsSchema, patchMapsSchema } from "../validation/schemas/maps.schemas";
import { addInstagramSchema, addInstagramParamsSchema, deleteInstagramEmbedParamsSchema } from "../validation/schemas/instagram.schemas";
import { addUploadParamsSchema, deleteUploadParamsSchema } from "../validation/schemas/uploads.schemas";
import { listLocationsQuerySchema, deleteLocationSlugSchema, deleteLocationIdSchema } from "../validation/schemas/locations.schemas";
import { taxonomyLocationKeyParamsSchema } from "../validation/schemas/taxonomy.schemas";
import { createCorrectionSchema, deleteCorrectionParamsSchema } from "../validation/schemas/taxonomy-correction.schemas";
import { syncLocationIdSchema, syncAllSchema } from "../validation/schemas/payload.schemas";

// Import controllers
import {
  // Core
  getLocations, getLocationsBasic, getLocationById, deleteLocationBySlug, deleteLocationById,
  refetchPlaceId,
  getDiningTypes, getAccommodationsTypes, getAttractionsTypes, getNightlifeTypes,
  postAddMaps, patchMapsById,
  getLocationHierarchy, getCountries, getCountryNames, getCitiesByCountry, getNeighborhoodsByCity,

  // Content
  postAddInstagram, deleteInstagramEmbed,
  postAddUpload, postAddUploadImageSet, postGenerateAltText, deleteUpload,
  serveImage,
  fetchReviews, fetchReviewsPipeline, getReviewsPipelineStatus, downloadReviews, getReviewsStatus,
  fetchTripAdvisorReviews, downloadTripAdvisorReviews, getTripAdvisorReviewsStatus,
  translateAndMergeReviews, downloadMergedReviews, getMergedReviewsStatus, getMergedReviewsReport, downloadRejectsReport,

  // Admin
  clearDatabase, scanOrphanedFiles, cleanupOrphanedFiles,
  getPendingTaxonomy, approveTaxonomy, rejectTaxonomy,
  getAllCorrections, previewCorrection, createCorrection, deleteCorrection,
  getPayloadLocationRefs,

  // Integration
  postSyncLocation, postSyncAll, getSyncStatus, getTestConnection,
} from "../controllers";

// Location routes
app.get("/api/locations", validateQuery(listLocationsQuerySchema), getLocations);
app.get("/api/locations-basic", validateQuery(listLocationsQuerySchema), getLocationsBasic);
app.get("/api/locations/:id", validateParams(deleteLocationIdSchema), getLocationById);
app.post("/api/locations", validateBody(createMapsSchema), postAddMaps);
app.patch("/api/locations/:id", validateBody(patchMapsSchema), patchMapsById);
app.delete("/api/locations/:id", validateParams(deleteLocationIdSchema), deleteLocationById);
app.post("/api/locations/:id/refetch-place-id", validateParams(deleteLocationIdSchema), refetchPlaceId);
app.post(
  "/api/add-instagram/:id",
  validateParams(addInstagramParamsSchema),
  validateBody(addInstagramSchema),
  postAddInstagram
);
app.post(
  "/api/add-upload/:id",
  validateParams(addUploadParamsSchema),
  postAddUpload
);
app.post(
  "/api/add-upload-imageset/:id",
  validateParams(addUploadParamsSchema),
  postAddUploadImageSet
);
app.post("/api/generate-alt-text", postGenerateAltText);
app.delete(
  "/api/uploads/:id",
  validateParams(deleteUploadParamsSchema),
  deleteUpload
);
app.delete(
  "/api/instagram-embeds/:id",
  validateParams(deleteInstagramEmbedParamsSchema),
  deleteInstagramEmbed
);
app.get("/api/clear-db", clearDatabase);

// Admin orphan cleanup routes
app.get("/api/admin/orphaned-files", scanOrphanedFiles);
app.post("/api/admin/orphaned-files/cleanup", cleanupOrphanedFiles);

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
app.get("/api/payload/sync-status", getSyncStatus);
app.get("/api/payload/sync-status/:id", getSyncStatus);
app.get("/api/payload/test-connection", getTestConnection);

// Serve uploaded images
app.get("/api/images/*", serveImage);

// Google Reviews routes
app.post("/api/locations/:id/reviews/fetch", validateParams(deleteLocationIdSchema), fetchReviews);
app.post("/api/locations/:id/reviews/fetch-pipeline", validateParams(deleteLocationIdSchema), fetchReviewsPipeline);
app.get("/api/locations/:id/reviews/pipeline-status", validateParams(deleteLocationIdSchema), getReviewsPipelineStatus);
app.get("/api/locations/:id/reviews/download", validateParams(deleteLocationIdSchema), downloadReviews);
app.get("/api/locations/:id/reviews/status", validateParams(deleteLocationIdSchema), getReviewsStatus);

// TripAdvisor Reviews routes
app.post("/api/locations/:id/tripadvisor-reviews/fetch", validateParams(deleteLocationIdSchema), fetchTripAdvisorReviews);
app.get("/api/locations/:id/tripadvisor-reviews/download", validateParams(deleteLocationIdSchema), downloadTripAdvisorReviews);
app.get("/api/locations/:id/tripadvisor-reviews/status", validateParams(deleteLocationIdSchema), getTripAdvisorReviewsStatus);

// Merged Reviews routes (translate & merge)
app.post("/api/locations/:id/reviews/translate-merge", validateParams(deleteLocationIdSchema), translateAndMergeReviews);
app.get("/api/locations/:id/reviews/merged/download", validateParams(deleteLocationIdSchema), downloadMergedReviews);
app.get("/api/locations/:id/reviews/merged/status", validateParams(deleteLocationIdSchema), getMergedReviewsStatus);
app.get("/api/locations/:id/reviews/merged/report", validateParams(deleteLocationIdSchema), getMergedReviewsReport);
app.get("/api/locations/:id/reviews/rejects/download", validateParams(deleteLocationIdSchema), downloadRejectsReport);
