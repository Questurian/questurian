import type {
  PayloadApiClient,
  PayloadEntryData,
  PayloadEntryResponse,
} from "../clients/payload-api.client";
import type { PayloadCollection } from "../mappers/location-payload.mapper";

/**
 * Owns Payload entry create/update selection and the legacy type fallback policy.
 */
export class PayloadEntryUpsertService {
  constructor(private readonly payloadClient: PayloadApiClient) {}

  async upsertWithTypeFallback(
    collection: PayloadCollection,
    payloadData: PayloadEntryData,
    existingDocId?: string
  ): Promise<PayloadEntryResponse> {
    try {
      return await this.upsert(collection, payloadData, existingDocId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (!payloadData.type || !this.isTypeSelectionError(errorMessage)) {
        throw error;
      }

      const normalizedType = this.normalizeType(payloadData.type);
      if (normalizedType !== payloadData.type) {
        console.warn(
          `⚠️  Payload rejected type "${payloadData.type}" for ${collection}. ` +
            `Retrying with "${normalizedType}".`
        );

        try {
          return await this.upsert(
            collection,
            { ...payloadData, type: normalizedType },
            existingDocId
          );
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          if (!this.isTypeSelectionError(fallbackMessage)) {
            throw fallbackError;
          }
        }
      }

      console.warn(
        `⚠️  Payload rejected type "${payloadData.type}" for ${collection}. Retrying without type.`
      );

      const payloadDataWithoutType = { ...payloadData };
      delete payloadDataWithoutType.type;
      return await this.upsert(collection, payloadDataWithoutType, existingDocId);
    }
  }

  private async upsert(
    collection: PayloadCollection,
    payloadData: PayloadEntryData,
    existingDocId?: string
  ): Promise<PayloadEntryResponse> {
    if (existingDocId) {
      return await this.payloadClient.updateEntry(collection, existingDocId, payloadData);
    }

    return await this.payloadClient.upsertEntry(collection, payloadData, {
      replaceGallery: collection === "attractions",
    });
  }

  private isTypeSelectionError(errorMessage: string): boolean {
    return errorMessage.includes("Details > Type") || errorMessage.includes("\"path\":\"type\"");
  }

  private normalizeType(value: string): string {
    return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  }
}
