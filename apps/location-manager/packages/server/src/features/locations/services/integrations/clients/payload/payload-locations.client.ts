import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type {
  PayloadLocationCreateData,
  PayloadLocationCreateResponse,
  PayloadLocationQueryResponse,
} from "./payload-location.types";

export class PayloadLocationsClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

  async getLocationRefByKey(locationKey: string): Promise<string | null> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    if (!locationKey) {
      return null;
    }

    const token = await this.authClient.ensureAuthenticated();
    const params = new URLSearchParams({
      "where[locationKey][equals]": locationKey,
    });

    const apiUrl = this.authClient.getApiUrl();
    console.log("[Payload] Lookup locationRef", {
      locationKey,
      url: `${apiUrl}/api/locations?${params.toString()}`,
    });

    const response = await fetch(`${apiUrl}/api/locations?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Location lookup failed", {
        locationKey,
        status: response.status,
        errorText,
      });
      throw new Error(`Payload location lookup failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as PayloadLocationQueryResponse;
    const firstDoc = result.docs?.[0];
    const totalDocs = result.totalDocs ?? result.docs?.length ?? 0;

    console.log("[Payload] Location lookup result", {
      locationKey,
      totalDocs,
      locationRef: firstDoc?.id || null,
    });

    return firstDoc?.id != null ? String(firstDoc.id) : null;
  }

  async createLocation(data: PayloadLocationCreateData): Promise<string> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    console.log("[Payload] Create location", data);

    const response = await fetch(`${apiUrl}/api/locations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Payload] Location creation failed", {
        status: response.status,
        errorText,
      });
      throw new Error(`Payload location creation failed: ${response.status} - ${errorText}`);
    }

    const rawResult = await response.json();
    const result = normalizeDocResponse<PayloadLocationCreateResponse["doc"]>(
      rawResult,
      "location create"
    );

    console.log("[Payload] Location created", {
      id: result.doc.id,
      level: result.doc.level,
      locationKey: result.doc.locationKey || null,
    });

    return String(result.doc.id);
  }
}
