import { IDEAL_FOR_TAG_GROUPS, type IdealForTag } from "@shared/types/location-ideal-for";
import type { ParsedIdealForInputResult } from "../types/location-browse.types";

export type { ParsedIdealForInputResult };

export const MAX_IDEAL_FOR_SELECTIONS = 4;
export const IDEAL_FOR_TAG_OPTIONS: readonly IdealForTag[] = IDEAL_FOR_TAG_GROUPS.flatMap((group) => group.tags);
export const IDEAL_FOR_TAG_BY_NORMALIZED = new Map<string, IdealForTag>(
  IDEAL_FOR_TAG_OPTIONS.map((tag) => [normalizeTagText(tag), tag] as const)
);

export function normalizeTagText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['"`]+|['"`]+$/g, "").trim();
}

export function tokenizeTagInput(rawInput: string): string[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return withoutBrackets
    .split(/[\n,;]+/)
    .map((token) => stripWrappingQuotes(token))
    .filter((token) => token.length > 0);
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i += 1) {
    currentRow[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow[j + 1] = Math.min(
        currentRow[j] + 1,
        previousRow[j + 1] + 1,
        previousRow[j] + cost
      );
    }

    for (let j = 0; j < previousRow.length; j += 1) {
      previousRow[j] = currentRow[j];
    }
  }

  return previousRow[b.length];
}

export function getClosestTagSuggestion(token: string): string | null {
  const normalizedToken = normalizeTagText(token);
  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  IDEAL_FOR_TAG_OPTIONS.forEach((option) => {
    const distance = levenshteinDistance(normalizedToken, normalizeTagText(option));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option;
    }
  });

  const maxDistance = Math.max(2, Math.floor(normalizedToken.length * 0.35));

  return bestDistance <= maxDistance ? bestMatch : null;
}

export function parseIdealForDirectInput(rawInput: string): ParsedIdealForInputResult {
  const parsedTokens = tokenizeTagInput(rawInput);

  if (parsedTokens.length === 0) {
    return { ok: false, error: "Enter at least one tag before applying." };
  }

  const resolvedTags: IdealForTag[] = [];
  const unknownTokens: string[] = [];

  parsedTokens.forEach((token) => {
    const resolvedTag = IDEAL_FOR_TAG_BY_NORMALIZED.get(normalizeTagText(token));
    if (resolvedTag) {
      resolvedTags.push(resolvedTag);
    } else {
      unknownTokens.push(token);
    }
  });

  if (unknownTokens.length > 0) {
    const unknownTokenMessage = unknownTokens
      .map((token) => {
        const suggestion = getClosestTagSuggestion(token);
        return suggestion
          ? `"${token}" (did you mean "${suggestion}"?)`
          : `"${token}"`;
      })
      .join(", ");

    return { ok: false, error: `Check spelling for: ${unknownTokenMessage}.` };
  }

  const duplicateTags = resolvedTags.filter(
    (tag, index) => resolvedTags.indexOf(tag) !== index
  );

  if (duplicateTags.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateTags));
    return { ok: false, error: `Remove duplicate tags: ${uniqueDuplicates.join(", ")}.` };
  }

  if (resolvedTags.length > MAX_IDEAL_FOR_SELECTIONS) {
    return {
      ok: false,
      error: `You can only apply up to ${MAX_IDEAL_FOR_SELECTIONS} tags at once.`,
    };
  }

  return { ok: true, tags: resolvedTags };
}

export function formatTagsAsArray(tags: readonly IdealForTag[]): string {
  return `[${tags.map((tag) => `"${tag}"`).join(", ")}]`;
}
