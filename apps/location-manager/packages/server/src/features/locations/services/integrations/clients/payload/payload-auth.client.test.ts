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
});
