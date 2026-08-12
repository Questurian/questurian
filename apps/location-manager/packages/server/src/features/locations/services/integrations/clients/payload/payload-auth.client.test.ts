import { afterEach, describe, expect, test } from "bun:test";
import type { EnvConfig } from "@server/shared/config/env.config";
import { PayloadAuthClient } from "./payload-auth.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PayloadAuthClient", () => {
  test("builds the Payload authorization header", async () => {
    globalThis.fetch = (async () => {
      throw new Error("authHeader must not perform a login request");
    }) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_API_KEY: "test-key",
    } as EnvConfig);

    await expect(client.authHeader()).resolves.toEqual({
      Authorization: "service-accounts API-Key test-key",
    });
  });

  test("verifies the credential has Location Manager access", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      requests.push({ url, init });

      return new Response(
        JSON.stringify({
          collections: {
            locations: { create: true },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_API_KEY: "test-key",
    } as EnvConfig);

    await expect(client.testConnection()).resolves.toBeUndefined();
    expect(requests).toEqual([
      {
        url: "https://payload.example.com/api/access",
        init: {
          method: "GET",
          headers: { Authorization: "service-accounts API-Key test-key" },
        },
      },
    ]);
  });

  test("rejects an anonymous or underprivileged access response", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          collections: {
            locations: { read: true },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_API_KEY: "test-key",
    } as EnvConfig);

    await expect(client.testConnection()).rejects.toThrow(
      "Payload credential lacks required locations:create access",
    );
  });

  test("fails before building a header when the API key is absent", async () => {
    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_API_KEY: "",
    } as EnvConfig);

    expect(client.isConfigured()).toBe(false);
    await expect(client.authHeader()).rejects.toThrow(
      "Payload CMS is not configured or unavailable",
    );
  });
});
