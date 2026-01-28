import { EnvConfig } from "@server/shared/config/env.config";
import { ImageStorageService } from "@server/shared/services/storage/image-storage.service";
import { InstagramApiClient } from "@server/shared/services/external/instagram-api.client";
import { PayloadApiClient } from "@server/shared/services/external/payload-api.client";
import { BigDataCloudClient } from "@server/shared/services/external/bigdatacloud-api.client";
import { GeoapifyClient } from "@server/shared/services/external/geoapify-api.client";
import { AltTextApiClient } from "@server/shared/services/external/alt-text-api.client";
import {
  MapsService,
  InstagramService,
  UploadsService,
  LocationQueryService,
  LocationMutationService,
  TaxonomyService,
  DistrictExtractionService,
  TaxonomyCorrectionService,
  PayloadSyncService
} from "../services";

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
  readonly locationQueryService: LocationQueryService;
  readonly locationMutationService: LocationMutationService;
  readonly payloadSyncService: PayloadSyncService;

  private constructor() {
    // Singletons
    this.config = EnvConfig.getInstance();
    this.imageStorage = new ImageStorageService();
    this.instagramApi = new InstagramApiClient(this.config);
    this.payloadApi = new PayloadApiClient(this.config);
    this.bigDataCloudClient = new BigDataCloudClient();
    this.geoapifyClient = new GeoapifyClient(this.config.GEOAPIFY_API_KEY || "");
    this.altTextApiClient = new AltTextApiClient(this.config.altTextApiUrl);
    this.districtExtractionService = new DistrictExtractionService();
    this.taxonomyService = new TaxonomyService();
    this.taxonomyCorrectionService = new TaxonomyCorrectionService();

    // Services with dependencies
    this.mapsService = new MapsService(
      this.config,
      this.taxonomyService,
      this.taxonomyCorrectionService,
      this.payloadApi
    );
    this.instagramService = new InstagramService(
      this.instagramApi,
      this.imageStorage
    );
    this.uploadsService = new UploadsService(this.imageStorage, this.altTextApiClient);
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
