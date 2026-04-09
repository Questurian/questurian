import type { PayloadEntriesClient } from "./payload-entries.client";
import type {
  PayloadCollection,
  PayloadEntryData,
  PayloadRelationshipId,
} from "./payload-api.types";

export class PayloadGalleryMergerService {
  constructor(private readonly entriesClient: PayloadEntriesClient) {}

  private normalizeRelationshipId(id: PayloadRelationshipId): PayloadRelationshipId {
    if (typeof id === "number") {
      return id;
    }

    const trimmed = id.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    return trimmed;
  }

  private dedupeRelationshipIds(ids: PayloadRelationshipId[]): PayloadRelationshipId[] {
    const seen = new Set<string>();
    const result: PayloadRelationshipId[] = [];

    for (const rawId of ids) {
      const normalizedId = this.normalizeRelationshipId(rawId);
      const key = String(normalizedId);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(normalizedId);
    }

    return result;
  }

  async prepareUpsert(
    collection: PayloadCollection,
    data: PayloadEntryData,
    options?: {
      replaceGallery?: boolean;
    }
  ): Promise<{ existingDocId: string | null; mergedData: PayloadEntryData }> {
    const existingDocId = await this.entriesClient.findEntryByTitle(collection, data.title);

    if (!existingDocId) {
      return { existingDocId: null, mergedData: data };
    }

    console.log("[Payload] Entry exists, merging galleries before update", {
      collection,
      docId: existingDocId,
      title: data.title,
    });

    const existingEntry = await this.entriesClient.getEntryById(collection, existingDocId);

    if (!existingEntry) {
      return { existingDocId, mergedData: data };
    }

    const replaceGallery = options?.replaceGallery === true;
    const existingGalleryIds =
      existingEntry.doc.gallery?.map((item) =>
        typeof item.image === "string" ? item.image : item.image.id
      ) || [];
    const newGalleryIds = data.gallery?.map((item) => item.image) || [];
    const mergedGalleryIds = replaceGallery
      ? this.dedupeRelationshipIds(newGalleryIds)
      : this.dedupeRelationshipIds([...existingGalleryIds, ...newGalleryIds]);

    const existingInstagramIds =
      existingEntry.doc.instagramGallery?.map((item) =>
        typeof item.post === "string" ? item.post : item.post.id
      ) || [];
    const newInstagramIds = data.instagramGallery?.map((item) => item.post) || [];
    const mergedInstagramIds = this.dedupeRelationshipIds([
      ...existingInstagramIds,
      ...newInstagramIds,
    ]);

    const mergedData: PayloadEntryData = {
      ...data,
      gallery: mergedGalleryIds.map((id) => ({ image: id, altText: "", caption: "" })),
      instagramGallery: mergedInstagramIds.map((id) => ({ post: id })),
    };

    console.log("[Payload] Merged galleries", {
      replaceGallery,
      existingGalleryCount: existingGalleryIds.length,
      newGalleryCount: newGalleryIds.length,
      mergedGalleryCount: mergedGalleryIds.length,
      existingInstagramCount: existingInstagramIds.length,
      newInstagramCount: newInstagramIds.length,
      mergedInstagramCount: mergedInstagramIds.length,
    });

    return { existingDocId, mergedData };
  }
}
