import { EnvConfig } from "@server/shared/config/env.config";

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
      const errorText = await response.text();
      throw new Error(`Instagram API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const parsed = this.parseMediaResponse(data);
    if (parsed.imageUrls.length === 0) {
      throw new Error("Instagram API returned no image URLs for this post");
    }
    return parsed;
  }

  private parseMediaResponse(data: any): InstagramMediaResponse {
    const imageUrls = new Set<string>();

    const getBestUrl = (candidates: Array<{ url: string }> | undefined) => {
      if (!candidates || candidates.length === 0) return null;
      return candidates[0]!.url;
    };

    if (data && data.media) {
      if (data.media.carousel_media) {
        data.media.carousel_media.forEach((item: any) => {
          if (item.image_versions2?.candidates) {
            const url = getBestUrl(item.image_versions2.candidates);
            if (url) imageUrls.add(url);
          }
        });
      } else if (data.media.image_versions2?.candidates) {
        const url = getBestUrl(data.media.image_versions2.candidates);
        if (url) imageUrls.add(url);
      }
    }

    // Fallback parsing for different response formats
    if (imageUrls.size === 0 && Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.pictureUrl) imageUrls.add(item.pictureUrl);
      });
    } else if (imageUrls.size === 0 && data?.pictureUrl) {
      imageUrls.add(data.pictureUrl);
    }

    // Generic deep fallback for provider response shape changes
    if (imageUrls.size === 0) {
      const discovered = this.collectImageUrlsDeep(data);
      for (const url of discovered) imageUrls.add(url);
    }

    const urls = Array.from(imageUrls);

    return {
      imageUrls: urls,
      mediaType: urls.length > 1 ? "carousel" : "single"
    };
  }

  private collectImageUrlsDeep(input: unknown): string[] {
    const urls = new Set<string>();

    const looksLikeImageUrl = (value: string): boolean => {
      if (!/^https?:\/\//i.test(value)) return false;
      if (/\.mp4(\?|$)/i.test(value)) return false;
      return (
        /cdninstagram|instagram\.fbna|scontent/i.test(value) ||
        /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(value)
      );
    };

    const walk = (node: unknown): void => {
      if (typeof node === "string") {
        if (looksLikeImageUrl(node)) urls.add(node);
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }

      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const value of Object.values(obj)) walk(value);
      }
    };

    walk(input);
    return Array.from(urls);
  }
}
