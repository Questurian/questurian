import { describe, expect, test } from "bun:test";
import { assertPayloadConfig } from "./env.config";

describe("Payload environment configuration", () => {
  test("fails production startup when the API key is absent", () => {
    expect(() =>
      assertPayloadConfig({
        apiUrl: "https://payload.example.com",
        apiKey: "",
        nodeEnv: "production",
      }),
    ).toThrow("Missing required Payload configuration: PAYLOAD_API_KEY");
  });

  test("fails partial development configuration instead of silently disabling sync", () => {
    expect(() =>
      assertPayloadConfig({
        apiUrl: "https://payload.example.com",
        apiKey: "",
        nodeEnv: "development",
      }),
    ).toThrow("Missing required Payload configuration: PAYLOAD_API_KEY");
  });

  test("allows Payload sync to remain wholly disabled outside production", () => {
    expect(() =>
      assertPayloadConfig({
        apiUrl: "",
        apiKey: "",
        nodeEnv: "development",
      }),
    ).not.toThrow();
  });
});
