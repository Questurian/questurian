import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { ImageSetUpload } from "../../../models/location";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import {
  handleDeleteUpload,
  handleReprocessUploadVariants,
  handleUpdateUploadPhotographerCredit,
} from "./upload-lifecycle.handlers";

type TestEnv = {
  Variables: {
    validatedParams: unknown;
    validatedBody: unknown;
  };
};

describe("upload lifecycle handlers", () => {
  test("deletes the validated upload ID", async () => {
    const deleted: number[] = [];
    const app = new Hono<TestEnv>();
    app.delete("/", (c) => {
      c.set("validatedParams", { id: "23" });
      const uploads: Pick<UploadsService, "deleteUpload"> = {
        deleteUpload: async (id: number) => {
          deleted.push(id);
        },
      };
      return handleDeleteUpload(c, uploads);
    });

    const response = await app.request("/", { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(deleted).toEqual([23]);
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Upload deleted successfully" },
    });
  });

  test("passes credit updates and reprocess requests to their service methods", async () => {
    const entry = {
      id: 23,
      location_id: 7,
      format: "imageset",
    } as ImageSetUpload;
    const creditCalls: unknown[][] = [];
    const reprocessCalls: number[] = [];
    const app = new Hono<TestEnv>();
    app.patch("/credit", (c) => {
      c.set("validatedParams", { id: "23" });
      c.set("validatedBody", { photographerCredit: "Jane Doe" });
      const uploads: Pick<UploadsService, "updateUploadPhotographerCredit"> = {
        updateUploadPhotographerCredit: async (
          ...args: Parameters<UploadsService["updateUploadPhotographerCredit"]>
        ) => {
          creditCalls.push(args);
          return entry;
        },
      };
      return handleUpdateUploadPhotographerCredit(c, uploads);
    });
    app.post("/reprocess", (c) => {
      c.set("validatedParams", { id: "23" });
      const uploads: Pick<UploadsService, "reprocessUploadVariants"> = {
        reprocessUploadVariants: async (id: number) => {
          reprocessCalls.push(id);
          return entry;
        },
      };
      return handleReprocessUploadVariants(c, uploads);
    });

    const creditResponse = await app.request("/credit", { method: "PATCH" });
    const reprocessResponse = await app.request("/reprocess", {
      method: "POST",
    });

    expect(creditResponse.status).toBe(200);
    expect(reprocessResponse.status).toBe(200);
    expect(creditCalls).toEqual([[23, "Jane Doe"]]);
    expect(reprocessCalls).toEqual([23]);
  });
});
