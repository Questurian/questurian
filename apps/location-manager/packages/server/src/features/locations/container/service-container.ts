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
import { DiningFieldSuggestionService } from "../services/integrations/dining-field-suggestion.service";
import { PendingSuggestionsService } from "../services/integrations/pending-suggestions.service";

export interface LocationClients {
  readonly instagramApi: InstagramApiClient;
  readonly payloadApi: PayloadApiClient;
  readonly bigDataCloud: BigDataCloudClient;
  readonly geoapify: GeoapifyClient;
  readonly altTextApi: AltTextApiClient;
  readonly googlePhotos: GooglePlacesPhotosClient;
}

export interface LocationCoreServices {
  readonly maps: MapsService;
  readonly query: LocationQueryService;
  readonly mutation: LocationMutationService;
}

export interface LocationContentServices {
  readonly instagram: InstagramService;
  readonly uploads: UploadsService;
  readonly photoImport: PhotoImportService;
  readonly tripAdvisorPlace: TripAdvisorPlaceService;
}

export interface LocationAdminServices {
  readonly taxonomy: TaxonomyService;
  readonly taxonomyCorrection: TaxonomyCorrectionService;
  readonly imageStorage: ImageStorageService;
  readonly districtExtraction: DistrictExtractionService;
}

export interface LocationSuggestionServices {
  readonly accommodationsField: AccommodationsFieldSuggestionService;
  readonly diningField: DiningFieldSuggestionService;
  readonly pending: PendingSuggestionsService;
}

export interface LocationIntegrationServices {
  readonly payloadSync: PayloadSyncService;
}

export class ServiceContainer {
  private static instance: ServiceContainer;

  readonly config: EnvConfig;
  readonly clients: LocationClients;
  readonly core: LocationCoreServices;
  readonly content: LocationContentServices;
  readonly admin: LocationAdminServices;
  readonly suggestions: LocationSuggestionServices;
  readonly integration: LocationIntegrationServices;

  private constructor() {
    const config = EnvConfig.getInstance();
    const imageStorage = new ImageStorageService();
    const instagramApi = new InstagramApiClient(config);
    const payloadApi = new PayloadApiClient(config);
    const bigDataCloud = new BigDataCloudClient(config.BIGDATACLOUD_API_KEY);
    const geoapify = new GeoapifyClient(config.GEOAPIFY_API_KEY || "");
    const altTextApi = new AltTextApiClient(config.altTextApiUrl);
    const googlePhotos = new GooglePlacesPhotosClient(config);
    const districtExtraction = new DistrictExtractionService();
    const taxonomy = new TaxonomyService();
    const taxonomyCorrection = new TaxonomyCorrectionService();
    const tripAdvisorPlace = new TripAdvisorPlaceService(config);

    const maps = new MapsService(
      config,
      taxonomy,
      taxonomyCorrection,
      payloadApi,
      tripAdvisorPlace
    );
    const instagram = new InstagramService(instagramApi, imageStorage);
    const uploads = new UploadsService(imageStorage, altTextApi);
    const photoImport = new PhotoImportService(
      googlePhotos,
      imageStorage,
    );
    const accommodationsField = new AccommodationsFieldSuggestionService(altTextApi);
    const diningField = new DiningFieldSuggestionService(altTextApi);
    const pending = new PendingSuggestionsService();
    const query = new LocationQueryService();
    const mutation = new LocationMutationService(imageStorage);
    const payloadSync = new PayloadSyncService(
      payloadApi,
      imageStorage,
      query
    );

    this.config = config;
    this.clients = {
      instagramApi,
      payloadApi,
      bigDataCloud,
      geoapify,
      altTextApi,
      googlePhotos,
    };
    this.core = { maps, query, mutation };
    this.content = { instagram, uploads, photoImport, tripAdvisorPlace };
    this.admin = {
      taxonomy,
      taxonomyCorrection,
      imageStorage,
      districtExtraction,
    };
    this.suggestions = { accommodationsField, diningField, pending };
    this.integration = { payloadSync };
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }
}
