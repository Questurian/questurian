import { afterEach, describe, expect, mock, test } from "bun:test";
import { InstagramApiClient } from "./instagram-api.client";

const originalFetch = globalThis.fetch;

function client() {
  return new InstagramApiClient({ RAPID_API_KEY: "test-key" } as never);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("InstagramApiClient.fetchMediaUrls", () => {
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
