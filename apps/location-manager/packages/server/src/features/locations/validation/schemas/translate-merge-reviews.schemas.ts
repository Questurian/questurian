import type { TranslateMergeOptions } from "../../types/translate-merge-reviews.types";

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

type TranslateMergeBody = {
  sources?: unknown;
};

export function parseTranslateMergeRequest(body: unknown): ParseResult<TranslateMergeOptions> {
  const payload = (typeof body === "object" && body !== null ? body : {}) as TranslateMergeBody;

  if (!Array.isArray(payload.sources)) {
    return {
      ok: true,
      value: {
        includeGoogle: true,
        includeTripadvisor: true,
      },
    };
  }

  const normalizedSources = payload.sources.map((source) =>
    typeof source === "string" ? source.toLowerCase() : ""
  );

  const includeGoogle = normalizedSources.includes("google");
  const includeTripadvisor = normalizedSources.includes("tripadvisor");

  if (!includeGoogle && !includeTripadvisor) {
    return { ok: false, error: "At least one source is required" };
  }

  return {
    ok: true,
    value: {
      includeGoogle,
      includeTripadvisor,
    },
  };
}
