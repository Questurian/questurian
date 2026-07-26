import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import { handleGenerateAltText } from "./upload-alt-text.handler";

function appWithErrorBody() {
  const app = new Hono();
  app.onError((error, c) =>
    c.json(
      {
        message: error.message,
        statusCode: (error as { statusCode?: number }).statusCode,
      },
      400,
    ),
  );
  return app;
}

describe("upload alt-text handler", () => {
  test("generates preview alt text and caches it for a staged upload", async () => {
    const generated: unknown[][] = [];
    const cached: unknown[][] = [];
    const app = appWithErrorBody();
    app.post("/", (c) => {
      const uploads: Pick<
        UploadsService,
        "generateAltText" | "cacheStagedAltText"
      > = {
        generateAltText: async (
          ...args: Parameters<UploadsService["generateAltText"]>
        ) => {
          generated.push(args);
          return "A busy night market";
        },
        cacheStagedAltText: (
          ...args: Parameters<UploadsService["cacheStagedAltText"]>
        ) => {
          cached.push(args);
        },
      };
      return handleGenerateAltText(c, uploads);
    });

    const formData = new FormData();
    formData.set(
      "image",
      new File(["image"], "market.jpeg", { type: "image/jpeg" }),
    );
    formData.set("uploadId", "17");

    const response = await app.request("/", { method: "POST", body: formData });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { altText: "A busy night market" },
    });
    expect(generated[0]?.[1]).toBe("market.jpeg");
    expect(generated[0]?.[2]).toBe("jpeg");
    expect(cached).toEqual([[17, "A busy night market"]]);
  });

  test("preserves preview-generation failure translation", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const app = appWithErrorBody();
      app.post("/", (c) => {
        const uploads: Pick<
          UploadsService,
          "generateAltText" | "cacheStagedAltText"
        > = {
          generateAltText: async () => {
            throw new Error("Vertex unavailable");
          },
          cacheStagedAltText: () => {},
        };
        return handleGenerateAltText(c, uploads);
      });

      const formData = new FormData();
      formData.set(
        "image",
        new File(["image"], "market.webp", { type: "image/webp" }),
      );
      const response = await app.request("/", {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: "Failed to generate alt text",
        statusCode: 400,
      });
    } finally {
      console.error = originalConsoleError;
    }
  });
});
