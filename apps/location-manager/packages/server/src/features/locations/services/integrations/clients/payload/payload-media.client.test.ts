import { afterEach, describe, expect, test } from "bun:test";
import { PayloadMediaClient } from "./payload-media.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PayloadMediaClient", () => {
  test("leaves multipart Content-Type to fetch for media uploads", async () => {
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(init?.headers).toEqual({
        Authorization: "service-accounts API-Key test-key",
      });
      expect(init?.body).toBeInstanceOf(FormData);

      return new Response(
        JSON.stringify({
          doc: {
            id: "42",
            filename: "lima.jpg",
            altText: "Lima skyline",
          },
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const client = new PayloadMediaClient({
      isConfigured: () => true,
      authHeader: async () => ({
        Authorization: "service-accounts API-Key test-key",
      }),
      getApiUrl: () => "https://payload.example.com",
    } as never);

    await expect(
      client.uploadImage(Buffer.from("image"), "lima.jpg", "Lima skyline", {
        photographerCredit: "Questurian",
      }),
    ).resolves.toBe("42");
  });
});
