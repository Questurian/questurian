import { afterEach, describe, expect, test } from "bun:test";
import type { EnvConfig } from "@server/shared/config/env.config";
import { PayloadAuthClient } from "./payload-auth.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PayloadAuthClient", () => {
  test("builds the Payload authorization header", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          token: "test-token",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200 }
      )) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_SERVICE_EMAIL: "service@example.com",
      PAYLOAD_SERVICE_PASSWORD: "secret",
    } as EnvConfig);

    await expect(client.authHeader()).resolves.toEqual({
      Authorization: "JWT test-token",
    });
  });

  test("verifies the credential has Location Manager access", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/api/users/login")) {
        return new Response(
          JSON.stringify({
            token: "test-token",
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          collections: {
            locations: { create: true },
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_SERVICE_EMAIL: "service@example.com",
      PAYLOAD_SERVICE_PASSWORD: "secret",
    } as EnvConfig);

    await expect(client.testConnection()).resolves.toBeUndefined();
    expect(requests[1]).toEqual({
      url: "https://payload.example.com/api/access",
      init: {
        method: "GET",
        headers: { Authorization: "JWT test-token" },
      },
    });
  });

  test("rejects an anonymous or underprivileged access response", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/users/login")) {
        return new Response(
          JSON.stringify({
            token: "invalid-or-underprivileged-token",
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          collections: {
            locations: { read: true },
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const client = new PayloadAuthClient({
      PAYLOAD_API_URL: "https://payload.example.com",
      PAYLOAD_SERVICE_EMAIL: "service@example.com",
      PAYLOAD_SERVICE_PASSWORD: "secret",
    } as EnvConfig);

    await expect(client.testConnection()).rejects.toThrow(
      "Payload credential lacks required locations:create access"
    );
  });
});
