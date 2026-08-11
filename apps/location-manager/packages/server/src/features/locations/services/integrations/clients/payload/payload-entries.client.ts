import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type { PayloadEntryData, PayloadEntryResponse } from "./payload-entry.types";
import type { PayloadLocationQueryResponse } from "./payload-location.types";
import type {
  PayloadCollection,
} from "./payload-shared.types";

export class PayloadEntriesClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

  async findEntryByTitle(collection: PayloadCollection, title: string): Promise<string | null> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const authHeader = await this.authClient.authHeader();
    const params = new URLSearchParams({
      "where[title][equals]": title,
      limit: "1",
    });

    const apiUrl = this.authClient.getApiUrl();
    console.log("[Payload] Lookup entry by title", {
      collection,
      title,
      url: `${apiUrl}/api/${collection}?${params.toString()}`,
    });

    const response = await fetch(`${apiUrl}/api/${collection}?${params.toString()}`, {
      method: "GET",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Entry lookup failed", {
        collection,
        title,
        status: response.status,
        errorText,
      });
      throw new Error(`Payload entry lookup failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as PayloadLocationQueryResponse;
    const firstDoc = result.docs?.[0];
    const totalDocs = result.totalDocs ?? result.docs?.length ?? 0;

    console.log("[Payload] Entry lookup result", {
      collection,
      title,
      totalDocs,
      payloadDocId: firstDoc?.id || null,
    });

    return firstDoc?.id || null;
  }

  async getEntryById(collection: PayloadCollection, docId: string): Promise<PayloadEntryResponse | null> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const authHeader = await this.authClient.authHeader();
    const apiUrl = this.authClient.getApiUrl();

    console.log("[Payload] Fetch entry by ID", {
      collection,
      docId,
      url: `${apiUrl}/api/${collection}/${docId}`,
    });

    const response = await fetch(`${apiUrl}/api/${collection}/${docId}`, {
      method: "GET",
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[Payload] Entry not found: ${collection}/${docId}`);
        return null;
      }

      const errorText = await response.text();
      console.error("[Payload] Entry fetch failed", {
        collection,
        docId,
        status: response.status,
        errorText,
      });
      throw new Error(`Payload entry fetch failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("[Payload] Raw GET response:", JSON.stringify(result).substring(0, 500));

    const normalized = normalizeDocResponse<PayloadEntryResponse["doc"]>(
      result,
      `GET ${collection}/${docId}`
    );
    const normalizedResult: PayloadEntryResponse = {
      message: normalized.message ?? "",
      doc: normalized.doc,
    };

    console.log("[Payload] Entry fetched", {
      collection,
      docId,
      title: normalizedResult.doc.title,
      galleryCount: normalizedResult.doc.gallery?.length || 0,
      instagramGalleryCount: normalizedResult.doc.instagramGallery?.length || 0,
    });

    return normalizedResult;
  }

  async createEntry(collection: PayloadCollection, data: PayloadEntryData): Promise<PayloadEntryResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const authHeader = await this.authClient.authHeader();
    const apiUrl = this.authClient.getApiUrl();

    console.log("[Payload] Create entry", {
      collection,
      title: data.title,
      type: data.type,
      locationRef: data.locationRef,
      gallery: data.gallery,
      instagramGallery: data.instagramGallery,
      idealFor: data.idealFor,
      cuisines: data.cuisines,
      ianaTimeId: data.ianaTimeId,
      status: data.status,
    });

    const response = await fetch(`${apiUrl}/api/${collection}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const sentRefs = {
        locationRef: data.locationRef ?? "(none)",
        galleryIds: data.gallery?.map(g => g.image) ?? [],
        instagramIds: data.instagramGallery?.map(i => i.post) ?? [],
      };
      console.error("[Payload] Entry creation failed", {
        collection,
        status: response.status,
        errorText,
        sentRefs,
      });
      throw new Error(
        `Payload entry creation failed: ${response.status} - ${errorText} ` +
        `| locationRef=${sentRefs.locationRef} ` +
        `| gallery=[${sentRefs.galleryIds.join(",")}] ` +
        `| instagram=[${sentRefs.instagramIds.join(",")}]`
      );
    }

    const rawResult = await response.json();
    const normalized = normalizeDocResponse<PayloadEntryResponse["doc"]>(
      rawResult,
      `${collection} entry create`
    );
    const result: PayloadEntryResponse = {
      message: normalized.message ?? "",
      doc: normalized.doc,
    };

    console.log(`✓ Created ${collection} entry in Payload: ${result.doc.title} → ID: ${result.doc.id}`);

    return result;
  }

  async updateEntry(
    collection: PayloadCollection,
    docId: string,
    data: PayloadEntryData
  ): Promise<PayloadEntryResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const authHeader = await this.authClient.authHeader();
    const apiUrl = this.authClient.getApiUrl();

    console.log("[Payload] Update entry", {
      collection,
      docId,
      title: data.title,
      type: data.type,
      locationRef: data.locationRef,
      idealFor: data.idealFor,
      cuisines: data.cuisines,
      ianaTimeId: data.ianaTimeId,
      galleryCount: data.gallery?.length || 0,
      instagramGalleryCount: data.instagramGallery?.length || 0,
    });

    const response = await fetch(`${apiUrl}/api/${collection}/${docId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const sentRefs = {
        locationRef: data.locationRef ?? "(none)",
        galleryIds: data.gallery?.map(g => g.image) ?? [],
        instagramIds: data.instagramGallery?.map(i => i.post) ?? [],
      };
      console.error("[Payload] Entry update failed", {
        collection,
        docId,
        status: response.status,
        errorText,
        sentRefs,
      });
      throw new Error(
        `Payload entry update failed: ${response.status} - ${errorText} ` +
        `| locationRef=${sentRefs.locationRef} ` +
        `| gallery=[${sentRefs.galleryIds.join(",")}] ` +
        `| instagram=[${sentRefs.instagramIds.join(",")}]`
      );
    }

    const rawResult = await response.json();
    const normalized = normalizeDocResponse<PayloadEntryResponse["doc"]>(
      rawResult,
      `${collection} entry update`
    );
    const result: PayloadEntryResponse = {
      message: normalized.message ?? "",
      doc: normalized.doc,
    };

    console.log(`✓ Updated ${collection} entry in Payload: ${result.doc.title} → ID: ${result.doc.id}`);

    return result;
  }
}
