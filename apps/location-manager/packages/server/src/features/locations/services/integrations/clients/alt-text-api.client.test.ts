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

  test("returns field suggestion when API responds with success", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:8642/field-suggestion");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });

      return new Response(
        JSON.stringify({
          suggestion: "yes",
          confidence: 0.86,
          reason: "The official amenities page lists WiFi.",
          sources: [{ label: "Official site", url: "https://example.com" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");
    const result = await client.suggestField({
      category: "accommodations",
      field_key: "wifi",
      field_label: "WiFi",
      kind: "single",
      allowed_options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      form_values: { name: "Hotel", address: "123 Main St" },
      api_context: {},
    });

    expect(result.suggestion).toBe("yes");
    expect(result.confidence).toBe(0.86);
  });

  test("throws detailed error when field suggestion fails", async () => {
    globalThis.fetch = (async () => {
      return new Response("Vertex unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      });
    }) as unknown as typeof fetch;

    const client = new AltTextApiClient("http://localhost:8642");

    await expect(
      client.suggestField({
        category: "accommodations",
        field_key: "wifi",
        field_label: "WiFi",
        kind: "single",
        allowed_options: [{ value: "yes", label: "Yes" }],
        form_values: { name: "Hotel", address: "123 Main St" },
        api_context: {},
      })
    ).rejects.toThrow("Field suggestion failed (503): Vertex unavailable");
  });
});
