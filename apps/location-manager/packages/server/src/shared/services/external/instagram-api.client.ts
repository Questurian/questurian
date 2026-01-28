import { EnvConfig } from "../../config/env.config";

export interface InstagramMediaResponse {
  imageUrls: string[];
  mediaType: "single" | "carousel";
}

export class InstagramApiClient {
  private readonly apiKey: string;
  private readonly apiHost = "instagram120.p.rapidapi.com";

  constructor(config: EnvConfig) {
    this.apiKey = config.RAPID_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetchMediaUrls(postUrl: string): Promise<InstagramMediaResponse> {
    if (!this.isConfigured()) {
      throw new Error("Instagram API not configured - RAPID_API_KEY missing");
    }

    const response = await fetch(
      `https://${this.apiHost}/api/instagram/links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": this.apiHost,
          "x-rapidapi-key": this.apiKey,
        },
        body: JSON.stringify({ url: postUrl }),
      }
    );

    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.status}`);
    }

    const data: any = await response.json();
    return this.parseMediaResponse(data);
  }

  private parseMediaResponse(data: any): InstagramMediaResponse {
    const imageUrls: string[] = [];

    const getBestUrl = (candidates: Array<{ url: string }> | undefined) => {
      if (!candidates || candidates.length === 0) return null;
      return candidates[0]!.url;
    };

    if (data && data.media) {
      if (data.media.carousel_media) {
        data.media.carousel_media.forEach((item: any) => {
          if (item.image_versions2?.candidates) {
            const url = getBestUrl(item.image_versions2.candidates);
            if (url) imageUrls.push(url);
          }
        });
      } else if (data.media.image_versions2?.candidates) {
        const url = getBestUrl(data.media.image_versions2.candidates);
        if (url) imageUrls.push(url);
      }
    }

    // Fallback parsing for different response formats
    if (imageUrls.length === 0 && Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.pictureUrl) imageUrls.push(item.pictureUrl);
      });
    } else if (imageUrls.length === 0 && data?.pictureUrl) {
      imageUrls.push(data.pictureUrl);
    }

    return {
      imageUrls,
      mediaType: imageUrls.length > 1 ? "carousel" : "single"
    };
  }
}
