import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import { normalizeDocResponse } from "./payload-http.client";
import { PayloadAuthClient } from "./payload-auth.client";
import type {
  PayloadInstagramPostData,
  PayloadInstagramPostResponse,
} from "./payload-instagram.types";

export class PayloadInstagramClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

  async createInstagramPost(data: PayloadInstagramPostData): Promise<string> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const authHeader = await this.authClient.authHeader();
    const apiUrl = this.authClient.getApiUrl();

    const response = await fetch(`${apiUrl}/api/instagram-posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Payload Instagram post creation failed: ${response.status} - ${errorText}`);
    }

    const rawResult = await response.json();
    const normalized = normalizeDocResponse<PayloadInstagramPostResponse["doc"]>(
      rawResult,
      "instagram post create"
    );
    const result: PayloadInstagramPostResponse = {
      message: normalized.message ?? "",
      doc: normalized.doc,
    };

    console.log(`✓ Created Instagram post in Payload: ${result.doc.title} → ID: ${result.doc.id}`);

    return result.doc.id;
  }
}
