import { afterEach, describe, expect, mock, test } from "bun:test";
import { InstagramApiClient, InstagramApiError } from "./instagram-api.client";

const originalFetch = globalThis.fetch;

function client() {
  return new InstagramApiClient({ RAPID_API_KEY: "test-key" } as never);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("InstagramApiClient.fetchMediaUrls", () => {
  test("preserves the quota counter when the provider rejects a request", async () => {
    globalThis.fetch = mock(async () => new Response("quota exceeded", {
      status: 429,
      headers: {
        "x-ratelimit-requests-limit": "100",
        "x-ratelimit-requests-remaining": "0",
      },
    })) as unknown as typeof fetch;

    try {
      await client().fetchMediaUrls("https://www.instagram.com/p/POST/");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(InstagramApiError);
      expect((error as InstagramApiError).quota).toEqual({ limit: 100, remaining: 0 });
    }
  });

  test("calls Instagram Downloader v2 and parses its photo media response", async () => {
    let request: Request | null = null;
    globalThis.fetch = mock(async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        media: [
          { url: "https://cdn.test/a.webp", thumb: "https://cdn.test/a-thumb.webp", is_video: false },
          { url: "https://cdn.test/b.webp", thumb: "https://cdn.test/b-thumb.webp", is_video: false },
        ],
        owner: { username: "place" },
      }), {
        status: 200,
        headers: {
          "x-ratelimit-requests-limit": "100",
          "x-ratelimit-requests-remaining": "96",
        },
      });
    }) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/p/POST/");

    expect(request!.method).toBe("GET");
    expect(request!.url).toBe(
      "https://instagram-downloader-v2-scraper-reels-igtv-posts-stories.p.rapidapi.com/get-post?url=https%3A%2F%2Fwww.instagram.com%2Fp%2FPOST%2F",
    );
    expect(request!.headers.get("x-rapidapi-host")).toBe(
      "instagram-downloader-v2-scraper-reels-igtv-posts-stories.p.rapidapi.com",
    );
    expect(result).toEqual({
      imageUrls: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"],
      mediaType: "carousel",
      eligibility: "photos-only",
      items: [
        { key: "position-0", position: 0, mediaType: "photo", imageUrl: "https://cdn.test/a.webp" },
        { key: "position-1", position: 1, mediaType: "photo", imageUrl: "https://cdn.test/b.webp" },
      ],
      quota: { limit: 100, remaining: 96 },
    });
  });

  test("classifies video media from Instagram Downloader v2", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      media: [{ url: "https://cdn.test/video.mp4", thumb: "https://cdn.test/poster.webp", is_video: true }],
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/reel/POST/");

    expect(result.eligibility).toBe("video");
    expect(result.items).toEqual([
      { key: "position-0", position: 0, mediaType: "video", imageUrl: "https://cdn.test/poster.webp" },
    ]);
    expect(result.quota).toEqual({ limit: null, remaining: null });
  });

  test("classifies an all-photo carousel and preserves item order", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      media: {
        carousel_media: [
          { id: "photo-a", media_type: 1, image_versions2: { candidates: [{ url: "https://cdn.test/a.jpg" }] } },
          { id: "photo-b", media_type: 1, image_versions2: { candidates: [{ url: "https://cdn.test/b.jpg" }] } },
        ],
      },
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/p/POST/");

    expect(result.eligibility).toBe("photos-only");
    expect(result.items).toEqual([
      { key: "photo-a", position: 0, mediaType: "photo", imageUrl: "https://cdn.test/a.jpg" },
      { key: "photo-b", position: 1, mediaType: "photo", imageUrl: "https://cdn.test/b.jpg" },
    ]);
  });

  test("marks mixed photo-video carousels ineligible", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      media: {
        carousel_media: [
          { id: "photo-a", media_type: 1, image_versions2: { candidates: [{ url: "https://cdn.test/a.jpg" }] } },
          { id: "video-b", media_type: 2, video_versions: [{ url: "https://cdn.test/b.mp4" }], image_versions2: { candidates: [{ url: "https://cdn.test/poster.jpg" }] } },
        ],
      },
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/p/POST/");

    expect(result.eligibility).toBe("mixed");
    expect(result.items.map((item) => item.mediaType)).toEqual(["photo", "video"]);
  });

  test("classifies provider pictureUrl arrays as photo carousels", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify([
      { id: "photo-a", pictureUrl: "https://cdn.test/a.jpg" },
      { id: "photo-b", pictureUrl: "https://cdn.test/b.jpg" },
    ]), { status: 200 })) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/p/POST/");

    expect(result.eligibility).toBe("photos-only");
    expect(result.items.map((item) => item.key)).toEqual(["photo-a", "photo-b"]);
  });

  test("detects videoUrl entries in provider arrays", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify([
      { id: "photo-a", pictureUrl: "https://cdn.test/a.jpg" },
      { id: "video-b", pictureUrl: "https://cdn.test/poster.jpg", videoUrl: "https://cdn.test/b.mp4" },
    ]), { status: 200 })) as unknown as typeof fetch;

    const result = await client().fetchMediaUrls("https://www.instagram.com/p/POST/");

    expect(result.eligibility).toBe("mixed");
  });
});
