import { describe, expect, test } from "bun:test";
import { UploadsService } from "./uploads.service";

describe("UploadsService alt text behavior", () => {
  test("generateAltText rethrows errors for preview requests", async () => {
    const service = new UploadsService(
      {} as any,
      {
        generateAltText: async () => {
          throw new Error("Vertex unavailable");
        },
      } as any
    );

    await expect(
      service.generateAltText(Buffer.from("image-bytes"), "preview.jpg", "jpg")
    ).rejects.toThrow("Vertex unavailable");
  });

  test("generateAltTextOptional returns empty alt text when generation fails", async () => {
    const service = new UploadsService(
      {} as any,
      {
        generateAltText: async () => {
          throw new Error("Vertex unavailable");
        },
      } as any
    );

    const result = await (service as any).generateAltTextOptional(
      Buffer.from("image-bytes"),
      "source_0.webp",
      "webp"
    );

    expect(result).toBe("");
  });

  test("generateAltTextOptional returns generated alt text on success", async () => {
    const service = new UploadsService(
      {} as any,
      {
        generateAltText: async () => "Street vendor preparing grilled seafood",
      } as any
    );

    const result = await (service as any).generateAltTextOptional(
      Buffer.from("image-bytes"),
      "source_0.webp",
      "webp"
    );

    expect(result).toBe("Street vendor preparing grilled seafood");
  });
});
