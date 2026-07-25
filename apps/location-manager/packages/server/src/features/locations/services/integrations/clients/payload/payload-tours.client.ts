import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type { PayloadTourData, PayloadTourResponse } from "./payload-tour.types";

export class PayloadToursClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

  async findTourByTitle(title: string): Promise<string | null> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const params = new URLSearchParams({
      "where[title][equals]": title,
      limit: "1",
    });
    const apiUrl = this.authClient.getApiUrl();
    const response = await fetch(`${apiUrl}/api/tours?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `JWT ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Payload tour lookup failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as { docs?: Array<{ id?: string | number }> };
    const firstDoc = result.docs?.[0];
    return firstDoc?.id != null ? String(firstDoc.id) : null;
  }

  async createTour(data: PayloadTourData): Promise<PayloadTourResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();
    const response = await fetch(`${apiUrl}/api/tours`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Payload tour creation failed: ${response.status} - ${errorText}`);
    }

    const normalized = normalizeDocResponse<PayloadTourResponse["doc"]>(
      await response.json(),
      "tour create"
    );
    return {
      message: normalized.message,
      doc: normalized.doc,
    };
  }

  async updateTour(docId: string, data: PayloadTourData): Promise<PayloadTourResponse> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();
    const response = await fetch(`${apiUrl}/api/tours/${docId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Payload tour update failed: ${response.status} - ${errorText}`);
    }

    const normalized = normalizeDocResponse<PayloadTourResponse["doc"]>(
      await response.json(),
      "tour update"
    );
    return {
      message: normalized.message,
      doc: normalized.doc,
    };
  }
}
