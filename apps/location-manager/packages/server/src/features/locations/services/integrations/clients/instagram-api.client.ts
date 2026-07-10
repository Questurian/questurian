import { EnvConfig } from "@server/shared/config/env.config";

export interface InstagramMediaResponse {
  imageUrls: string[];
  mediaType: "single" | "carousel";
  eligibility: "photos-only" | "video" | "mixed" | "unknown";
  items: InstagramMediaItem[];
}

export interface InstagramMediaItem {
  key: string;
  position: number;
  mediaType: "photo" | "video" | "unknown";
  imageUrl?: string;
}

export class InstagramApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "InstagramApiError";
  }
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
      throw new InstagramApiError(response.status, `Instagram API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const parsed = this.parseMediaResponse(data);
    if (parsed.items.length === 0) {
      throw new Error("Instagram API returned no image URLs for this post");
    }
    return parsed;
  }

  private parseMediaResponse(data: any): InstagramMediaResponse {
    const getBestUrl = (candidates: Array<{ url: string }> | undefined) => {
      if (!candidates || candidates.length === 0) return null;
      return candidates[0]!.url;
    };

    const toItem = (item: any, position: number): InstagramMediaItem => {
      const video = item?.media_type === 2 || item?.product_type === "clips" ||
        (Array.isArray(item?.video_versions) && item.video_versions.length > 0);
      const photo = item?.media_type === 1 || (!video && !!item?.image_versions2?.candidates);
      const imageUrl = getBestUrl(item?.image_versions2?.candidates) ?? undefined;
      return {
        key: String(item?.id ?? item?.pk ?? `position-${position}`),
        position,
        mediaType: video ? "video" : photo ? "photo" : "unknown",
        ...(imageUrl ? { imageUrl } : {}),
      };
    };

    let items: InstagramMediaItem[] = [];
    if (data?.media?.carousel_media && Array.isArray(data.media.carousel_media)) {
      items = data.media.carousel_media.map(toItem);
    } else if (data?.media) {
      items = [toItem(data.media, 0)];
    }

    // Fallback parsing for different response formats
    if (items.length === 0 && Array.isArray(data)) {
      items = data.flatMap((item: any, position: number) => {
        const imageUrl = item?.pictureUrl ?? item?.picture_url ?? item?.thumbnailUrl ?? item?.thumbnail_url;
        const hasVideo = !!(item?.videoUrl ?? item?.video_url ?? item?.video);
        if (!imageUrl && !hasVideo) return [];
        return [{
          key: String(item.id ?? item.pk ?? `position-${position}`),
          position,
          mediaType: hasVideo ? "video" as const : imageUrl ? "photo" as const : "unknown" as const,
          ...(imageUrl ? { imageUrl } : {}),
        }];
      });
    } else if (items.length === 0 && data?.pictureUrl) {
      items = [{
        key: String(data.id ?? "position-0"),
        position: 0,
        mediaType: data.videoUrl ?? data.video_url ?? data.video ? "video" : "photo",
        imageUrl: data.pictureUrl,
      }];
    }

    // Generic deep fallback for provider response shape changes
    if (items.length === 0) {
      const discovered = this.collectImageUrlsDeep(data);
      items = discovered.map((imageUrl, position) => ({
        key: `position-${position}`,
        position,
        mediaType: "unknown" as const,
        imageUrl,
      }));
    }

    const kinds = new Set(items.map((item) => item.mediaType));
    const eligibility: InstagramMediaResponse["eligibility"] =
      kinds.size === 1 && kinds.has("photo") ? "photos-only"
      : kinds.size === 1 && kinds.has("video") ? "video"
      : kinds.has("video") && kinds.has("photo") ? "mixed"
      : "unknown";
    const imageUrls = items.flatMap((item) => item.imageUrl ? [item.imageUrl] : []);

    return {
      imageUrls,
      mediaType: items.length > 1 ? "carousel" : "single",
      eligibility,
      items,
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
