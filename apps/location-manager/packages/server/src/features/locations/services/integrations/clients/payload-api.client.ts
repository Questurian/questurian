import { EnvConfig } from "@server/shared/config/env.config";
import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import type { ImageVariantType } from "@questurian/lm-shared";
import { PayloadAuthClient } from "./payload/payload-auth.client";
import { PayloadEntriesClient } from "./payload/payload-entries.client";
import { PayloadGalleryMergerService } from "./payload/payload-gallery-merger.service";
import { PayloadInstagramClient } from "./payload/payload-instagram.client";
import { PayloadLocationsClient } from "./payload/payload-locations.client";
import { PayloadMediaClient } from "./payload/payload-media.client";
import { PayloadMediaSetsClient } from "./payload/payload-media-sets.client";

export type {
  PayloadCollection,
  PayloadMediaVariantType,
  PayloadAuthResponse,
  PayloadMediaAssetResponse,
  PayloadEntryResponse,
  PayloadLocationQueryResponse,
  PayloadLocationCreateData,
  PayloadLocationCreateResponse,
  PayloadGalleryItem,
  PayloadInstagramPostData,
  PayloadInstagramPostResponse,
  PayloadInstagramGalleryItem,
  PayloadNightlifeDetails,
  PayloadMediaSetData,
  PayloadMediaSetVariant,
  PayloadMediaSetResponse,
  PayloadMediaSetQueryResponse,
  PayloadEntryData,
} from "./payload/payload-api.types";
import type {
  PayloadCollection,
  PayloadEntryData,
  PayloadEntryResponse,
  PayloadInstagramPostData,
  PayloadLocationCreateData,
  PayloadMediaSetData,
} from "./payload/payload-api.types";

export class PayloadApiClient {
  private readonly authClient: PayloadAuthClient;
  private readonly locationsClient: PayloadLocationsClient;
  private readonly entriesClient: PayloadEntriesClient;
  private readonly mediaClient: PayloadMediaClient;
  private readonly instagramClient: PayloadInstagramClient;
  private readonly mediaSetsClient: PayloadMediaSetsClient;
  private readonly galleryMerger: PayloadGalleryMergerService;

  constructor(config: EnvConfig) {
    this.authClient = new PayloadAuthClient(config);
    this.locationsClient = new PayloadLocationsClient(this.authClient);
    this.entriesClient = new PayloadEntriesClient(this.authClient);
    this.mediaClient = new PayloadMediaClient(this.authClient);
    this.instagramClient = new PayloadInstagramClient(this.authClient);
    this.mediaSetsClient = new PayloadMediaSetsClient(this.authClient);
    this.galleryMerger = new PayloadGalleryMergerService(this.entriesClient);
  }

  isConfigured(): boolean {
    return this.authClient.isConfigured();
  }

  async authenticate(): Promise<string> {
    return await this.authClient.authenticate();
  }

  async uploadImage(
    fileBuffer: Buffer,
    filename: string,
    altText: string,
    options: {
      locationRef?: string;
      photographerCredit: string;
      mediaSet?: string;
      variant?: ImageVariantType;
    }
  ): Promise<string> {
    return await this.mediaClient.uploadImage(fileBuffer, filename, altText, options);
  }

  async updateMediaAssetLocationRef(mediaAssetId: string, locationRef: string): Promise<void> {
    return await this.mediaClient.updateImageLocationRef(mediaAssetId, locationRef);
  }

  async getLocationRefByKey(locationKey: string): Promise<string | null> {
    return await this.locationsClient.getLocationRefByKey(locationKey);
  }

  async findEntryByTitle(collection: PayloadCollection, title: string): Promise<string | null> {
    return await this.entriesClient.findEntryByTitle(collection, title);
  }

  async getEntryById(collection: PayloadCollection, docId: string): Promise<PayloadEntryResponse | null> {
    return await this.entriesClient.getEntryById(collection, docId);
  }

  async createLocation(data: PayloadLocationCreateData): Promise<string> {
    return await this.locationsClient.createLocation(data);
  }

  async createEntry(collection: PayloadCollection, data: PayloadEntryData): Promise<PayloadEntryResponse> {
    return await this.entriesClient.createEntry(collection, data);
  }

  async updateEntry(
    collection: PayloadCollection,
    docId: string,
    data: PayloadEntryData
  ): Promise<PayloadEntryResponse> {
    return await this.entriesClient.updateEntry(collection, docId, data);
  }

  async upsertEntry(collection: PayloadCollection, data: PayloadEntryData): Promise<PayloadEntryResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    console.log(`[Payload] Upserting entry in ${collection}`, {
      title: data.title,
    });

    const { existingDocId, mergedData } = await this.galleryMerger.prepareUpsert(collection, data);

    if (existingDocId) {
      return await this.entriesClient.updateEntry(collection, existingDocId, mergedData);
    }

    console.log("[Payload] Entry doesn't exist, creating", {
      collection,
      title: data.title,
    });

    return await this.entriesClient.createEntry(collection, mergedData);
  }

  async createInstagramPost(data: PayloadInstagramPostData): Promise<string> {
    return await this.instagramClient.createInstagramPost(data);
  }

  async findMediaSetByExternalRef(externalRef: string): Promise<string | null> {
    return await this.mediaSetsClient.findMediaSetByExternalRef(externalRef);
  }

  async createMediaSet(data: PayloadMediaSetData): Promise<string> {
    return await this.mediaSetsClient.createMediaSet(data);
  }

  async setMediaSetLocationRef(mediaSetId: string, locationRef: string): Promise<void> {
    return await this.mediaSetsClient.setMediaSetLocationRef(mediaSetId, locationRef);
  }

  async getMediaSetVariantAssetIds(mediaSetId: string): Promise<string[]> {
    return await this.mediaSetsClient.getMediaSetVariantAssetIds(mediaSetId);
  }

  async findOrCreateMediaSet(data: PayloadMediaSetData): Promise<string> {
    return await this.mediaSetsClient.findOrCreateMediaSet(data);
  }
}
