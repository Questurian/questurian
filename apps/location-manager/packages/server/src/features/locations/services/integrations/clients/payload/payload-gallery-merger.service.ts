import type { PayloadEntriesClient } from "./payload-entries.client";
import type { PayloadCollection, PayloadEntryData } from "./payload-api.types";

export class PayloadGalleryMergerService {
  constructor(private readonly entriesClient: PayloadEntriesClient) {}

  async prepareUpsert(
    collection: PayloadCollection,
    data: PayloadEntryData
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

    const existingGalleryIds =
      existingEntry.doc.gallery?.map((item) =>
        typeof item.image === "string" ? item.image : item.image.id
      ) || [];
    const newGalleryIds = data.gallery?.map((item) => item.image) || [];
    const mergedGalleryIds = Array.from(new Set([...existingGalleryIds, ...newGalleryIds]));

    const existingInstagramIds =
      existingEntry.doc.instagramGallery?.map((item) =>
        typeof item.post === "string" ? item.post : item.post.id
      ) || [];
    const newInstagramIds = data.instagramGallery?.map((item) => item.post) || [];
    const mergedInstagramIds = Array.from(new Set([...existingInstagramIds, ...newInstagramIds]));

    const mergedData: PayloadEntryData = {
      ...data,
      gallery: mergedGalleryIds.map((id) => ({ image: id, altText: "", caption: "" })),
      instagramGallery: mergedInstagramIds.map((id) => ({ post: id })),
    };

    console.log("[Payload] Merged galleries", {
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
