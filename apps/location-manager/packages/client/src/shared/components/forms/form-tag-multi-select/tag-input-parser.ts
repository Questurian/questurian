import type { TagSelectOption } from "../form-tag-multi-select.types";

type ParsedTagInputResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

function normalizeTagText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenizeTagInput(rawInput: string): string[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return withoutBrackets
    .split(/[\n,;]+/)
    .map((token) => token.trim().replace(/^['"`]+|['"`]+$/g, "").trim())
    .filter(Boolean);
}

function buildNormalizedValueMap(
  options: readonly TagSelectOption[]
): Map<string, string> {
  const normalizedValueMap = new Map<string, string>();
  options.forEach((option) => {
    normalizedValueMap.set(normalizeTagText(option.value), option.value);
    normalizedValueMap.set(normalizeTagText(option.label), option.value);
  });
  return normalizedValueMap;
}

function levenshteinDistance(a: string, b: string): number {
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

function getClosestTagSuggestion(
  token: string,
  optionValues: readonly string[]
): string | null {
  const normalizedToken = normalizeTagText(token);
  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  optionValues.forEach((option) => {
    const distance = levenshteinDistance(
      normalizedToken,
      normalizeTagText(option)
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option;
    }
  });

  const maxDistance = Math.max(2, Math.floor(normalizedToken.length * 0.35));
  return bestDistance <= maxDistance ? bestMatch : null;
}

export function parseDirectTagArrayInput(params: {
  rawInput: string;
  maxSelections: number;
  options: readonly TagSelectOption[];
}): ParsedTagInputResult {
  const { rawInput, maxSelections, options } = params;
  const parsedTokens = tokenizeTagInput(rawInput);
  if (parsedTokens.length === 0) {
    return { ok: false, error: "Enter at least one tag before applying." };
  }

  const normalizedValueMap = buildNormalizedValueMap(options);
  const optionValues = options.map((option) => option.value);
  const resolvedValues: string[] = [];
  const unknownTokens: string[] = [];

  parsedTokens.forEach((token) => {
    const resolvedValue = normalizedValueMap.get(normalizeTagText(token));
    if (resolvedValue) resolvedValues.push(resolvedValue);
    else unknownTokens.push(token);
  });

  if (unknownTokens.length > 0) {
    const unknownTokenMessage = unknownTokens
      .map((token) => {
        const suggestion = getClosestTagSuggestion(token, optionValues);
        return suggestion
          ? `"${token}" (did you mean "${suggestion}"?)`
          : `"${token}"`;
      })
      .join(", ");
    return { ok: false, error: `Check spelling for: ${unknownTokenMessage}.` };
  }

  const duplicates = Array.from(
    new Set(
      resolvedValues.filter(
        (value, index) => resolvedValues.indexOf(value) !== index
      )
    )
  );
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `Remove duplicate tags: ${duplicates.join(", ")}.`,
    };
  }

  if (resolvedValues.length > maxSelections) {
    return {
      ok: false,
      error: `You can only apply up to ${maxSelections} tags at once.`,
    };
  }
  return { ok: true, tags: resolvedValues };
}

export function formatTagsAsArray(tags: readonly string[]): string {
  return `[${tags.map((tag) => `"${tag}"`).join(", ")}]`;
}
