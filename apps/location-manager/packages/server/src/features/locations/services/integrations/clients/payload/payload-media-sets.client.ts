import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type {
  PayloadMediaSetData,
  PayloadMediaSetQueryResponse,
  PayloadMediaSetResponse,
} from "./payload-api.types";

export class PayloadMediaSetsClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

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

    return result.doc.id;
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
