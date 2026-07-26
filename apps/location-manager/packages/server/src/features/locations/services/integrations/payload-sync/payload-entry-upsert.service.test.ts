import { describe, expect, mock, test } from "bun:test";
import type { PayloadEntryData, PayloadEntryResponse } from "../clients/payload-api.client";
import { PayloadEntryUpsertService } from "./payload-entry-upsert.service";

const payloadData = (type: string | null = "Fine Dining"): PayloadEntryData => ({
  title: "Test location",
  type,
  gallery: [],
  status: "published",
});

const response = (id: string): PayloadEntryResponse =>
  ({
    message: "ok",
    doc: { id },
  }) as PayloadEntryResponse;

describe("PayloadEntryUpsertService", () => {
  test("updates a stored document id instead of running title-based upsert", async () => {
    const updateEntry = mock(
      async (_collection: string, _docId: string, _data: PayloadEntryData) =>
        response("stored-doc")
    );
    const upsertEntry = mock(
      async (
        _collection: string,
        _data: PayloadEntryData,
        _options?: { replaceGallery?: boolean }
      ) => response("new-doc")
    );
    const service = new PayloadEntryUpsertService({
      updateEntry,
      upsertEntry,
    } as never);

    const result = await service.upsertWithTypeFallback(
      "dining",
      payloadData(),
      "stored-doc"
    );

    expect(result.doc.id).toBe("stored-doc");
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(updateEntry.mock.calls[0]?.[0]).toBe("dining");
    expect(updateEntry.mock.calls[0]?.[1]).toBe("stored-doc");
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  test("replaces attraction galleries when creating or finding an entry", async () => {
    const upsertEntry = mock(
      async (
        _collection: string,
        _data: PayloadEntryData,
        _options?: { replaceGallery?: boolean }
      ) => response("attraction-doc")
    );
    const service = new PayloadEntryUpsertService({ upsertEntry } as never);

    await service.upsertWithTypeFallback("attractions", payloadData());

    expect(upsertEntry.mock.calls[0]?.[2]).toEqual({ replaceGallery: true });
  });

  test("normalizes a rejected type before retrying", async () => {
    const updateEntry = mock(async (_collection, _docId, data: PayloadEntryData) => {
      if (data.type === "Fine Dining") {
        throw new Error("Validation failed: Details > Type");
      }
      return response("stored-doc");
    });
    const service = new PayloadEntryUpsertService({ updateEntry } as never);

    await service.upsertWithTypeFallback("dining", payloadData(), "stored-doc");

    expect(updateEntry).toHaveBeenCalledTimes(2);
    expect(updateEntry.mock.calls[1]?.[2]).toMatchObject({ type: "fine-dining" });
  });

  test("removes type only when both original and normalized values are rejected", async () => {
    const updateEntry = mock(async (_collection, _docId, data: PayloadEntryData) => {
      if (data.type) {
        throw new Error('Validation failed: {"path":"type"}');
      }
      return response("stored-doc");
    });
    const service = new PayloadEntryUpsertService({ updateEntry } as never);

    await service.upsertWithTypeFallback("dining", payloadData(), "stored-doc");

    expect(updateEntry).toHaveBeenCalledTimes(3);
    expect(updateEntry.mock.calls[2]?.[2]).not.toHaveProperty("type");
  });

  test("does not retry failures unrelated to type selection", async () => {
    const updateEntry = mock(async () => {
      throw new Error("Payload timed out");
    });
    const service = new PayloadEntryUpsertService({ updateEntry } as never);

    await expect(
      service.upsertWithTypeFallback("dining", payloadData(), "stored-doc")
    ).rejects.toThrow("Payload timed out");
    expect(updateEntry).toHaveBeenCalledTimes(1);
  });
});
