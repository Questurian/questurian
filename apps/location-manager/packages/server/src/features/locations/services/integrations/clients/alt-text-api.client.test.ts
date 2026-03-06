import { afterEach, describe, expect, test } from "bun:test";
import { AltTextApiClient } from "./alt-text-api.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AltTextApiClient", () => {
  test("returns alt text when API responds with success", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      expect(String(input)).toBe("http://localhost:8642/alt");
      return new Response(JSON.stringify({ alt: "Chef plating ceviche at a restaurant counter" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");
    const result = await client.generateAltText(Buffer.from("img"), "photo.jpg", "jpeg");

    expect(result).toBe("Chef plating ceviche at a restaurant counter");
  });

  test("throws detailed error when API responds with failure", async () => {
    globalThis.fetch = (async () => {
      return new Response("Vertex unavailable", { status: 503, statusText: "Service Unavailable" });
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");

    await expect(
      client.generateAltText(Buffer.from("img"), "photo.jpg", "jpeg")
    ).rejects.toThrow("Alt text generation failed (503): Vertex unavailable");
  });

  test("returns neighborhood description when API responds with success", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:8642/neighborhood-description");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toBeTruthy();

      return new Response(
        JSON.stringify({
          description: "Miraflores blends walkable streets, cafes, and residential blocks with an easy base for exploring Lima.",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");
    const result = await client.generateNeighborhoodDescription({
      district: "Miraflores",
      city: "Lima",
      country: "Peru",
      category: "dining",
    });

    expect(result).toBe(
      "Miraflores blends walkable streets, cafes, and residential blocks with an easy base for exploring Lima."
    );
  });

  test("throws detailed error when neighborhood description generation fails", async () => {
    globalThis.fetch = (async () => {
      return new Response("Vertex unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      });
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");

    await expect(
      client.generateNeighborhoodDescription({ district: "Miraflores" })
    ).rejects.toThrow(
      "Neighborhood description generation failed (503): Vertex unavailable"
    );
  });
});
