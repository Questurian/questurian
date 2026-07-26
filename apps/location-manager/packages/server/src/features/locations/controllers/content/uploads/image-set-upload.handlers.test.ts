import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { ImageSetUpload } from "../../../models/location";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import {
  handleAddImageSetUpload,
  handleReplaceUploadVariants,
} from "./image-set-upload.handlers";
import { REQUIRED_VARIANT_TYPES } from "./image-set-upload.request";

type TestEnv = {
  Variables: {
    validatedParams: unknown;
    validatedBody: unknown;
  };
};

function completeImageSetFormData(): FormData {
  const formData = new FormData();
  formData.set(
    "source_0",
    new File(["source"], "source.jpg", { type: "image/jpeg" }),
  );
  for (const type of REQUIRED_VARIANT_TYPES) {
    formData.set(
      `variant_0_${type}`,
      new File([type], `${type}.webp`, { type: "image/webp" }),
    );
  }
  return formData;
}

describe("image-set upload handlers", () => {
  test("passes a parsed create request to the upload service", async () => {
    const calls: unknown[][] = [];
    const entry = {
      id: 91,
      location_id: 42,
      format: "imageset",
    } as ImageSetUpload;
    const app = new Hono<TestEnv>();
    app.post("/", async (c) => {
      c.set("validatedParams", { id: 42 });
      const uploads: Pick<UploadsService, "addImageSetUpload"> = {
        addImageSetUpload: async (
          ...args: Parameters<UploadsService["addImageSetUpload"]>
        ) => {
          calls.push(args);
          return entry;
        },
      };
      return handleAddImageSetUpload(c, uploads);
    });

    const formData = completeImageSetFormData();
    formData.set("photographerCredit", "  Jane Doe  ");
    const response = await app.request("/", { method: "POST", body: formData });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { entry },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(42);
    expect(calls[0]?.[2]).toHaveLength(REQUIRED_VARIANT_TYPES.length);
    expect(calls[0]?.[3]).toBe("Jane Doe");
    expect(calls[0]?.[4]).toBeNull();
  });

  test("passes replacement data without requiring photographer credit", async () => {
    const calls: unknown[][] = [];
    const entry = {
      id: 91,
      location_id: 42,
      format: "imageset",
    } as ImageSetUpload;
    const app = new Hono<TestEnv>();
    app.post("/", async (c) => {
      c.set("validatedParams", { id: "91" });
      const uploads: Pick<UploadsService, "replaceUploadVariants"> = {
        replaceUploadVariants: async (
          ...args: Parameters<UploadsService["replaceUploadVariants"]>
        ) => {
          calls.push(args);
          return entry;
        },
      };
      return handleReplaceUploadVariants(c, uploads);
    });

    const formData = completeImageSetFormData();
    formData.set("altText", "New description");
    const response = await app.request("/", { method: "POST", body: formData });

    expect(response.status).toBe(200);
    expect(calls[0]?.[0]).toBe(91);
    expect(calls[0]?.[3]).toBe("New description");
  });
});
