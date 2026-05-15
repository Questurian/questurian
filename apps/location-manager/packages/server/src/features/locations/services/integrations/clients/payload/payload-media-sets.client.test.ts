import { afterEach, describe, expect, test } from "bun:test";
import { PayloadMediaSetsClient } from "./payload-media-sets.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PayloadMediaSetsClient", () => {
  test("normalizes numeric Payload ids to strings for location-manager updates", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain("/api/media-sets?");
      expect(init?.headers).toEqual({
        Authorization: "JWT test-token",
      });

      return new Response(
        JSON.stringify({
          docs: [
            {
              id: 42,
              title: "Museum Hero",
              alt_text: "Front entrance of the museum",
              photographer_credit: "Questurian",
              status: "usable",
              location: "lima-peru",
              locationRef: 11,
              updatedAt: "2026-04-07T12:00:00.000Z",
              variants: {
                square: {
                  url: "/media/museum-square.webp",
                },
              },
            },
          ],
          totalDocs: 1,
          totalPages: 1,
          page: 1,
          limit: 20,
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const client = new PayloadMediaSetsClient({
      isConfigured: () => true,
      ensureAuthenticated: async () => "test-token",
      getApiUrl: () => "https://payload.example.com",
    } as never);

    const result = await client.searchMediaSets({
      page: 1,
      limit: 20,
    });

    expect(result.docs[0]?.id).toBe("42");
    expect(result.docs[0]?.status).toBe("usable");
    expect(result.docs[0]?.locationRef).toBe("11");
    expect(result.docs[0]?.previewUrl).toBe("https://payload.example.com/media/museum-square.webp");
  });

  test("accepts legacy complete status during media-set status migration", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          docs: [
            {
              id: 43,
              title: "Legacy Museum Hero",
              status: "complete",
              variants: {},
            },
          ],
          totalDocs: 1,
          totalPages: 1,
          page: 1,
          limit: 20,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )) as unknown as typeof fetch;

    const client = new PayloadMediaSetsClient({
      isConfigured: () => true,
      ensureAuthenticated: async () => "test-token",
      getApiUrl: () => "https://payload.example.com",
    } as never);

    const result = await client.searchMediaSets({
      page: 1,
      limit: 20,
    });

    expect(result.docs[0]?.status).toBe("complete");
  });
});
