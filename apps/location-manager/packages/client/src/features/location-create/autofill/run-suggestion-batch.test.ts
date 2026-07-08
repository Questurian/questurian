import { describe, expect, test } from "bun:test";
import { runSuggestionBatch, type SuggestionBatchOutcome } from "./run-suggestion-batch";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runSuggestionBatch", () => {
  test("tallies applied, rejected, and thrown fields", async () => {
    const settled: Array<{ field: string; outcome: SuggestionBatchOutcome; error: unknown }> = [];
    const result = await runSuggestionBatch({
      fields: ["applies", "rejects", "throws"],
      concurrency: 3,
      run: async (field) => {
        if (field === "throws") throw new Error("boom");
        return field === "applies";
      },
      onFieldSettled: (field, outcome, error) => settled.push({ field, outcome, error }),
    });

    expect(result).toEqual({ total: 3, applied: 1, failed: 2 });
    expect(settled.find((item) => item.field === "applies")?.outcome).toBe("applied");
    expect(settled.find((item) => item.field === "rejects")?.outcome).toBe("rejected");
    const thrown = settled.find((item) => item.field === "throws");
    expect(thrown?.outcome).toBe("error");
    expect((thrown?.error as Error).message).toBe("boom");
  });

  test("runs each field exactly once", async () => {
    const started: number[] = [];
    await runSuggestionBatch({
      fields: [1, 2, 3, 4, 5],
      concurrency: 2,
      run: async (field) => {
        started.push(field);
        return true;
      },
    });
    expect(started.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runSuggestionBatch({
      fields: ["a", "b", "c", "d", "e", "f"],
      concurrency: 2,
      run: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(5);
        inFlight -= 1;
        return true;
      },
    });
    expect(maxInFlight).toBe(2);
  });

  test("reports monotonic progress ending at the totals", async () => {
    const completedSeq: number[] = [];
    let last = { total: 0, completed: 0, applied: 0, failed: 0 };
    await runSuggestionBatch({
      fields: ["a", "b", "c", "d"],
      concurrency: 3,
      run: async (field) => {
        await delay(1);
        return field !== "c";
      },
      onFieldSettled: (_field, _outcome, _error, progress) => {
        completedSeq.push(progress.completed);
        last = progress;
      },
    });
    expect(completedSeq).toEqual([1, 2, 3, 4]);
    expect(last).toEqual({ total: 4, completed: 4, applied: 3, failed: 1 });
  });

  test("resolves immediately for an empty field list", async () => {
    const result = await runSuggestionBatch({
      fields: [],
      concurrency: 3,
      run: async () => true,
    });
    expect(result).toEqual({ total: 0, applied: 0, failed: 0 });
  });
});
