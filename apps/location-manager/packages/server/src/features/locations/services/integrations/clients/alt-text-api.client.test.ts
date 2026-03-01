import { afterEach, describe, expect, test } from "bun:test";
import { AltTextApiClient } from "./alt-text-api.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AltTextApiClient", () => {
  test("returns alt text when API responds with success", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://localhost:8642/alt");
      return new Response(JSON.stringify({ alt: "Chef plating ceviche at a restaurant counter" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");
    const result = await client.generateAltText(Buffer.from("img"), "photo.jpg", "jpeg");

    expect(result).toBe("Chef plating ceviche at a restaurant counter");
  });

  test("throws detailed error when API responds with failure", async () => {
    globalThis.fetch = (async () => {
      return new Response("Vertex unavailable", { status: 503, statusText: "Service Unavailable" });
    }) as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");

    await expect(
      client.generateAltText(Buffer.from("img"), "photo.jpg", "jpeg")
    ).rejects.toThrow("Alt text generation failed (503): Vertex unavailable");
  });
});
