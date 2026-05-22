import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import type { ImageVariantType } from "@questurian/lm-shared";
import { normalizeDocResponse } from "./payload-http.client";
import type { PayloadMediaAssetResponse } from "./payload-api.types";
import { PayloadAuthClient } from "./payload-auth.client";

export class PayloadMediaClient {
  constructor(private readonly authClient: PayloadAuthClient) {}

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
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: this.getMimeType(filename) });
    formData.append("file", blob, filename);

    const payload: Record<string, string | number> = {};

    console.log("🔍 [PAYLOAD CLIENT] uploadImage called with:", {
      filename,
      altText,
      options_locationRef: options.locationRef,
      options_locationRef_type: typeof options.locationRef,
      options_photographerCredit: options.photographerCredit,
    });

    if (altText) {
      payload.alt_text = altText;
    }

    const normalizedPhotographerCredit = options.photographerCredit.trim();
    if (!normalizedPhotographerCredit) {
      throw new Error("photographerCredit is required for Payload media upload");
    }
    payload.photographer_credit = normalizedPhotographerCredit;

    if (options.locationRef) {
      payload.locationRef = parseInt(options.locationRef, 10);
      console.log("✅ [PAYLOAD CLIENT] Added locationRef to payload:", payload.locationRef);
    } else {
      console.warn("⚠️  [PAYLOAD CLIENT] No locationRef provided, skipping");
    }

    if (options.mediaSet) {
      const parsedMediaSet = Number(options.mediaSet);
      if (Number.isNaN(parsedMediaSet)) {
        throw new Error(`Invalid mediaSet ID for Payload media upload: ${options.mediaSet}`);
      }
      payload.mediaSet = parsedMediaSet;
      console.log("✅ [PAYLOAD CLIENT] Added mediaSet to payload:", payload.mediaSet);
    }

    if (options.variant) {
      payload.variant = options.variant;
      console.log("✅ [PAYLOAD CLIENT] Added variant to payload:", payload.variant);
    }

    formData.append("_payload", JSON.stringify(payload));

    const apiUrl = this.authClient.getApiUrl();
    console.log("🔍 [PAYLOAD REQUEST] URL:", `${apiUrl}/api/media-assets`);
    console.log("🔍 [PAYLOAD REQUEST] filename:", filename);
    console.log("🔍 [PAYLOAD REQUEST] _payload:", JSON.stringify(payload, null, 2));
    console.log("🔍 [PAYLOAD REQUEST] locationRef:", options.locationRef || "none");

    const response = await fetch(`${apiUrl}/api/media-assets`, {
      method: "POST",
      headers: {
        Authorization: `JWT ${token}`,
      },
      body: formData,
    });

    console.log("🔍 [PAYLOAD RESPONSE] Status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [PAYLOAD ERROR] Status:", response.status);
      console.error("❌ [PAYLOAD ERROR] Response:", errorText);
      throw new Error(`Payload image upload failed: ${response.status} - ${errorText}`);
    }

    const rawResult = await response.json();
    const data = normalizeDocResponse<PayloadMediaAssetResponse["doc"]>(
      rawResult,
      "media asset upload"
    );

    console.log(`✓ Uploaded image to Payload: ${data.doc.filename} → ID: ${data.doc.id}`);
    console.log("🔍 [PAYLOAD RESPONSE] Full doc object:", JSON.stringify(data.doc, null, 2));
    console.log("🔍 [PAYLOAD RESPONSE] altText in response:", data.doc.altText);

    return data.doc.id;
  }

  async updateImageLocationRef(mediaAssetId: string, locationRef: string): Promise<void> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const parsedLocationRef = parseInt(locationRef, 10);
    if (Number.isNaN(parsedLocationRef)) {
      throw new Error(`Invalid locationRef for media asset update: ${locationRef}`);
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    const response = await fetch(`${apiUrl}/api/media-assets/${mediaAssetId}`, {
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
        `Payload media asset update failed (${mediaAssetId}): ${response.status} - ${errorText}`
      );
    }

    console.log(
      `✓ Updated media asset ${mediaAssetId} with locationRef ${parsedLocationRef}`
    );
  }

  async detachImageFromMediaSet(mediaAssetId: string): Promise<void> {
    if (!this.authClient.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const token = await this.authClient.ensureAuthenticated();
    const apiUrl = this.authClient.getApiUrl();

    const response = await fetch(`${apiUrl}/api/media-assets/${mediaAssetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify({
        mediaSet: null,
        variant: null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Payload media asset detach failed (${mediaAssetId}): ${response.status} - ${errorText}`
      );
    }

    console.log(`✓ Detached media asset ${mediaAssetId} from media-set`);
  }

  private getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();

    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      default:
        return "image/jpeg";
    }
  }
}
