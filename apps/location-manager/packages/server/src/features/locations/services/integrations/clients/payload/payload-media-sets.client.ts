import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type {
  PayloadMediaSetData,
  PayloadMediaSetFromSourceData,
  PayloadMediaSetFromSourceResponse,
  PayloadMediaSetListItem,
  PayloadMediaSetListResponse,
  PayloadMediaSetQueryResponse,
  PayloadMediaSetResponse,
  PayloadMediaSetSearchQueryDoc,
  PayloadMediaSetSearchResponse,
  PayloadMediaVariantType,
} from "./payload-api.types";

export class PayloadMediaSetsClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

  private static readonly PREVIEW_VARIANT_ORDER: PayloadMediaVariantType[] = [
    "square",
    "thumbnail",
    "wide",
    "portrait",
    "hero",
    "open_graph",
    "editorial",
  ];

  private extractRelationshipId(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "object" && value !== null && "id" in value) {
      const idValue = (value as { id?: unknown }).id;
      if (typeof idValue === "string" || typeof idValue === "number") {
        return String(idValue);
      }
    }
    return null;
  }

  private toAbsoluteUrl(url: string | null | undefined): string | null {
    if (!url) return null;

    try {
      return new URL(url, this.authClient.getApiUrl()).toString();
    } catch {
      return null;
    }
  }

  private getPreviewUrl(doc: PayloadMediaSetSearchQueryDoc): string | null {
    const variants = doc.variants;
    if (!variants || typeof variants !== "object") {
      return null;
    }

    for (const variantKey of PayloadMediaSetsClient.PREVIEW_VARIANT_ORDER) {
      const variant = variants[variantKey];
      if (!variant || typeof variant !== "object") {
        continue;
      }

      const url = typeof variant.url === "string" ? variant.url : null;
      if (url) {
        return this.toAbsoluteUrl(url);
      }
    }

    return null;
  }

  private normalizeMediaSetListItem(doc: PayloadMediaSetSearchQueryDoc): PayloadMediaSetListItem {
    return {
      id: String(doc.id),
      title: doc.title,
      altText: doc.alt_text ?? null,
      photographerCredit: doc.photographer_credit ?? null,
      status: doc.status ?? null,
      location: doc.location ?? null,
      locationRef: this.extractRelationshipId(doc.locationRef),
      previewUrl: this.getPreviewUrl(doc),
      updatedAt: doc.updatedAt ?? null,
    };
  }

  async findMediaSetByExternalRef(externalRef: string): Promise<string | null> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    if (!externalRef) {
      return null;
    }

    const token = await this.authClient.ensureAuthenticated();
    const params = new URLSearchParams({
      "where[externalRef][equals]": externalRef,
      limit: "1",
    });

    const apiUrl = this.authClient.getApiUrl();
    console.log("[Payload] Lookup media-set by externalRef", {
      externalRef,
      url: `${apiUrl}/api/media-sets?${params.toString()}`,
    });

    const response = await fetch(`${apiUrl}/api/media-sets?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Media-set lookup failed", {
        externalRef,
        status: response.status,
        errorText,
      });
      throw new Error(`Payload media-set lookup failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as PayloadMediaSetQueryResponse;
    const firstDoc = result.docs?.[0];
    const totalDocs = result.totalDocs ?? result.docs?.length ?? 0;

    console.log("[Payload] Media-set lookup result", {
      externalRef,
      totalDocs,
      mediaSetId: firstDoc?.id || null,
      status: firstDoc?.status || null,
    });

    return firstDoc?.id || null;
  }

  async createMediaSet(data: PayloadMediaSetData): Promise<string> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    console.log("[Payload] Create media-set", {
      title: data.title,
      externalRef: data.externalRef,
      location: data.location,
    });

    const response = await fetch(`${apiUrl}/api/media-sets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Media-set creation failed", {
        status: response.status,
        errorText,
      });
      throw new Error(`Payload media-set creation failed: ${response.status} - ${errorText}`);
    }

    const rawResult = await response.json();
    const normalized = normalizeDocResponse<PayloadMediaSetResponse["doc"]>(
      rawResult,
      "media-set create"
    );
    const result: PayloadMediaSetResponse = {
      message: normalized.message ?? "",
      doc: normalized.doc,
    };

    console.log(
      `✓ Created media-set in Payload: ${result.doc.title} → ID: ${result.doc.id} (status: ${result.doc.status})`
    );

    return String(result.doc.id);
  }

  async setMediaSetLocationRef(mediaSetId: string, locationRef: string): Promise<void> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const parsedLocationRef = parseInt(locationRef, 10);
    if (Number.isNaN(parsedLocationRef)) {
      throw new Error(`Invalid locationRef for media-set update: ${locationRef}`);
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    const response = await fetch(`${apiUrl}/api/media-sets/${mediaSetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify({
        locationRef: parsedLocationRef,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Payload media-set update failed (${mediaSetId}): ${response.status} - ${errorText}`
      );
    }

    console.log(
      `✓ Updated media-set ${mediaSetId} with locationRef ${parsedLocationRef}`
    );
  }

  async getMediaSetVariantAssetIds(mediaSetId: string): Promise<string[]> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    const response = await fetch(`${apiUrl}/api/media-sets/${mediaSetId}?depth=0`, {
      method: "GET",
      headers: {
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Payload media-set fetch failed (${mediaSetId}): ${response.status} - ${errorText}`
      );
    }

    const rawResult = await response.json();
    const normalized = normalizeDocResponse<{
      id?: string | number;
      variants?: Record<string, unknown>;
    }>(
      rawResult,
      "media-set fetch"
    );
    const variants = normalized.doc.variants;

    if (!variants || typeof variants !== "object") {
      return [];
    }

    const assetIds = Object.values(variants)
      .map((value) => this.extractRelationshipId(value))
      .filter((id): id is string => !!id);

    return Array.from(new Set(assetIds));
  }

  async searchMediaSets(params: {
    query?: string;
    page?: number;
    limit?: number;
    ids?: string[];
  }): Promise<PayloadMediaSetListResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();
    const trimmedQuery = params.query?.trim() ?? "";
    const ids = Array.from(new Set((params.ids ?? []).map((id) => id.trim()).filter(Boolean)));
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 24;
    const searchParams = new URLSearchParams({
      depth: "2",
    });

    if (ids.length > 0) {
      searchParams.set("where[id][in]", ids.join(","));
      searchParams.set("limit", String(ids.length));
      searchParams.set("page", "1");
    } else {
      searchParams.set("limit", String(limit));
      searchParams.set("page", String(page));
      searchParams.set("sort", "-updatedAt");

      if (trimmedQuery) {
        searchParams.set("where[or][0][title][contains]", trimmedQuery);
        searchParams.set("where[or][1][alt_text][contains]", trimmedQuery);
        searchParams.set("where[or][2][photographer_credit][contains]", trimmedQuery);
        searchParams.set("where[or][3][externalRef][contains]", trimmedQuery);
      }
    }

    const url = `${apiUrl}/api/media-sets?${searchParams.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Media-set search failed", {
        query: trimmedQuery,
        ids,
        page,
        limit,
        status: response.status,
        errorText,
      });
      throw new Error(`Payload media-set search failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as PayloadMediaSetSearchResponse;
    const docs = (result.docs ?? []).map((doc) => this.normalizeMediaSetListItem(doc));

    const orderedDocs =
      ids.length > 0
        ? ids
            .map((id) => docs.find((doc) => doc.id === id) ?? null)
            .filter((doc): doc is PayloadMediaSetListItem => doc !== null)
        : docs;

    const effectiveLimit = ids.length > 0
      ? orderedDocs.length
      : result.limit ?? limit;
    const effectiveTotalDocs = ids.length > 0
      ? orderedDocs.length
      : result.totalDocs ?? orderedDocs.length;
    const effectivePage = ids.length > 0 ? 1 : result.page ?? page;
    const effectiveTotalPages = ids.length > 0
      ? 1
      : result.totalPages ?? Math.max(1, Math.ceil(effectiveTotalDocs / Math.max(effectiveLimit, 1)));
    const hasPrevPage = ids.length > 0
      ? false
      : result.hasPrevPage ?? effectivePage > 1;
    const hasNextPage = ids.length > 0
      ? false
      : result.hasNextPage ?? effectivePage < effectiveTotalPages;

    return {
      docs: orderedDocs,
      totalDocs: effectiveTotalDocs,
      totalPages: effectiveTotalPages,
      page: effectivePage,
      limit: effectiveLimit,
      hasNextPage,
      hasPrevPage,
      nextPage: ids.length > 0
        ? null
        : result.nextPage ?? (hasNextPage ? effectivePage + 1 : null),
      prevPage: ids.length > 0
        ? null
        : result.prevPage ?? (hasPrevPage ? effectivePage - 1 : null),
    };
  }

  /**
   * Single-call MediaSet creation via Questura's `from-source` pipeline
   * (Questura ADR 0002). Sends the source image plus metadata as multipart;
   * Questura runs Sharp, generates 7 variants from the source biased by
   * `focal_point` (or per-variant `overrides`), uploads them all, and
   * assembles the MediaSet. Returns the new MediaSet id and variant ids.
   *
   * Replaces the multi-step "create MediaSet, then upload each variant"
   * flow that lives in `payload-media.client.uploadImage` + the legacy
   * `media-upload.handler` loop.
   */
  async createMediaSetFromSource(
    source: { buffer: Buffer; mimetype: string; filename: string },
    data: PayloadMediaSetFromSourceData,
  ): Promise<PayloadMediaSetFromSourceResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    const formData = new FormData();
    const blob = new Blob([source.buffer], { type: source.mimetype });
    formData.append("source", blob, source.filename);
    formData.append("data", JSON.stringify(data));

    const url = `${apiUrl}/api/media-sets/from-source`;
    console.log("[Payload] Create media-set from source", {
      title: data.title,
      externalRef: data.externalRef,
      sourceFilename: source.filename,
      sourceMime: source.mimetype,
      hasOverrides: Boolean(data.overrides),
      hasFocalPoint: Boolean(data.focal_point),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `JWT ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Media-set from-source failed", {
        status: response.status,
        errorText,
      });
      throw new Error(
        `Payload media-set from-source failed: ${response.status} - ${errorText}`,
      );
    }

    const result = (await response.json()) as PayloadMediaSetFromSourceResponse;

    console.log(
      `✓ Created media-set ${result.mediaSetId} via from-source (source asset ${result.sourceAssetId}, ${Object.keys(result.variantAssetIds).length} variants)`,
    );

    return result;
  }

  async findOrCreateMediaSet(data: PayloadMediaSetData): Promise<string> {
    if (!data.externalRef) {
      return await this.createMediaSet(data);
    }

    const existingId = await this.findMediaSetByExternalRef(data.externalRef);

    if (existingId) {
      console.log(
        `[Payload] Media-set already exists with externalRef: ${data.externalRef} → ID: ${existingId}`
      );
      return existingId;
    }

    return await this.createMediaSet(data);
  }
}
