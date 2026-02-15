import { describe, expect, test } from "bun:test";
import { parseFetchReviewsPipelineBody, parsePipelineStatusQuery } from "./reviews-pipeline.schemas";

describe("reviews pipeline schema parsing", () => {
  test("defaults to tripadvisor when sources missing or invalid", () => {
    const missingSources = parseFetchReviewsPipelineBody({});
    expect(missingSources).toEqual({
      ok: true,
      value: { sources: ["tripadvisor"] },
    });

    const emptySources = parseFetchReviewsPipelineBody({ sources: [] });
    expect(emptySources).toEqual({
      ok: true,
      value: { sources: ["tripadvisor"] },
    });

    const nonArraySources = parseFetchReviewsPipelineBody({ sources: "google" });
    expect(nonArraySources).toEqual({
      ok: true,
      value: { sources: ["tripadvisor"] },
    });
  });

  test("preserves provided sources when at least one valid source exists", () => {
    const inputSources = ["GOOGLE", "custom", "tripadvisor", "GOOGLE"];
    const result = parseFetchReviewsPipelineBody({ sources: inputSources });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected parse result to be ok");
    }

    expect(result.value.sources).toEqual(inputSources);
  });

  test("rejects payload when no supported sources are present", () => {
    const result = parseFetchReviewsPipelineBody({ sources: ["custom", "foo"] });
    expect(result).toEqual({
      ok: false,
      error: "At least one source is required",
    });
  });

  test("requires jobId for status query", () => {
    expect(parsePipelineStatusQuery({})).toEqual({
      ok: false,
      error: "jobId is required",
    });

    expect(parsePipelineStatusQuery({ jobId: "job_123" })).toEqual({
      ok: true,
      value: { jobId: "job_123" },
    });
  });
});

