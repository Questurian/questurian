import { EnvConfig } from "@server/shared/config/env.config";
import { ImageStorageService } from "../services/storage/image-storage.service";
import { InstagramApiClient } from "../services/integrations/clients/instagram-api.client";
import { PayloadApiClient } from "../services/integrations/clients/payload-api.client";
import { BigDataCloudClient } from "../services/integrations/clients/bigdatacloud-api.client";
import { GeoapifyClient } from "../services/integrations/clients/geoapify-api.client";
import { AltTextApiClient } from "../services/integrations/clients/alt-text-api.client";
import {
  MapsService,
  InstagramService,
  UploadsService,
  LocationQueryService,
  LocationMutationService,
  TaxonomyService,
  DistrictExtractionService,
  TaxonomyCorrectionService,
  PayloadSyncService,
  TripAdvisorPlaceService
} from "../services";
import { GooglePlacesPhotosClient } from "../services/integrations/clients/google-places-photos.client";
import { PhotoImportService } from "../services/integrations/photo-import.service";
import { AccommodationsFieldSuggestionService } from "../services/integrations/accommodations-field-suggestion.service";
import { DiningStage2SuggestionService } from "../services/integrations/dining-stage2-suggestion.service";
import { PendingSuggestionsService } from "../services/integrations/pending-suggestions.service";

export class ServiceContainer {
  private static instance: ServiceContainer;

  readonly config: EnvConfig;
  readonly imageStorage: ImageStorageService;
  readonly instagramApi: InstagramApiClient;
  readonly payloadApi: PayloadApiClient;
  readonly bigDataCloudClient: BigDataCloudClient;
  readonly geoapifyClient: GeoapifyClient;
  readonly altTextApiClient: AltTextApiClient;
  readonly districtExtractionService: DistrictExtractionService;
  readonly taxonomyService: TaxonomyService;
  readonly taxonomyCorrectionService: TaxonomyCorrectionService;
  readonly mapsService: MapsService;
  readonly instagramService: InstagramService;
  readonly uploadsService: UploadsService;
  readonly googlePhotosClient: GooglePlacesPhotosClient;
  readonly photoImportService: PhotoImportService;
  readonly locationQueryService: LocationQueryService;
  readonly locationMutationService: LocationMutationService;
  readonly payloadSyncService: PayloadSyncService;
  readonly tripAdvisorPlaceService: TripAdvisorPlaceService;
  readonly accommodationsFieldSuggestionService: AccommodationsFieldSuggestionService;
  readonly diningStage2SuggestionService: DiningStage2SuggestionService;
  readonly pendingSuggestionsService: PendingSuggestionsService;

  private constructor() {
    // Singletons
    this.config = EnvConfig.getInstance();
    this.imageStorage = new ImageStorageService();
    this.instagramApi = new InstagramApiClient(this.config);
    this.payloadApi = new PayloadApiClient(this.config);
    this.bigDataCloudClient = new BigDataCloudClient(this.config.BIGDATACLOUD_API_KEY);
    this.geoapifyClient = new GeoapifyClient(this.config.GEOAPIFY_API_KEY || "");
    this.altTextApiClient = new AltTextApiClient(this.config.altTextApiUrl);
    this.districtExtractionService = new DistrictExtractionService();
    this.taxonomyService = new TaxonomyService();
    this.taxonomyCorrectionService = new TaxonomyCorrectionService();
    this.tripAdvisorPlaceService = new TripAdvisorPlaceService(this.config);

    // Services with dependencies
    this.mapsService = new MapsService(
      this.config,
      this.taxonomyService,
      this.taxonomyCorrectionService,
      this.payloadApi,
      this.tripAdvisorPlaceService
    );
    this.instagramService = new InstagramService(
      this.instagramApi,
      this.imageStorage
    );
    this.uploadsService = new UploadsService(this.imageStorage, this.altTextApiClient);
    this.googlePhotosClient = new GooglePlacesPhotosClient(this.config);
    this.photoImportService = new PhotoImportService(
      this.googlePhotosClient,
      this.imageStorage,
      this.altTextApiClient
    );
    this.accommodationsFieldSuggestionService = new AccommodationsFieldSuggestionService(this.altTextApiClient);
    this.diningStage2SuggestionService = new DiningStage2SuggestionService(this.altTextApiClient);
    this.pendingSuggestionsService = new PendingSuggestionsService();
    this.locationQueryService = new LocationQueryService();
    this.locationMutationService = new LocationMutationService(this.imageStorage);
    this.payloadSyncService = new PayloadSyncService(
      this.payloadApi,
      this.imageStorage,
      this.locationQueryService
    );
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }
}
