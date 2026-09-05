import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_RATES } from "./rates";

/**
 * The rate card and the code that applies it must not disagree.
 *
 * `rates.ts` is what an operator reads; `token_usage.py` is what actually
 * prices a call. Two tables of the same numbers drift, and the drift is
 * invisible -- costs stay plausible while being wrong in one consistent
 * direction. So this reads the Python and fails when they part company.
 *
 * It parses rather than imports because the two live in different runtimes.
 * That is fragile by nature, so a parse that finds nothing fails loudly rather
 * than passing on an empty comparison.
 */

const TOKEN_USAGE_PY = join(
  import.meta.dir,
  "../../../ai-blog-writer/apps/backend/app/shared/token_usage.py",
);

function pythonRates(): Map<string, number[]> {
  const source = readFileSync(TOKEN_USAGE_PY, "utf8");
  const table = source.slice(source.indexOf("VERTEX_TOKEN_RATES = {"));
  const found = new Map<string, number[]>();
  const entry = /"([a-z0-9.\-]+)":\s*VertexTokenRate\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(table))) {
    const numbers = match[2]
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value));
    found.set(match[1], numbers);
  }
  return found;
}

describe("the published rate card", () => {
  const python = pythonRates();

  it("finds the table it is checking against", () => {
    // A regex that silently matches nothing would make every assertion below
    // pass without comparing anything.
    expect(python.size).toBeGreaterThan(3);
  });

  it("lists every model the pricing code knows", () => {
    const carded = new Set(MODEL_RATES.map((rate) => rate.model));
    const missing = [...python.keys()].filter((model) => !carded.has(model));
    expect(missing).toEqual([]);
  });

  it("agrees with the pricing code on every number", () => {
    for (const rate of MODEL_RATES) {
      const applied = python.get(rate.model);
      expect(applied, `${rate.model} is on the card but not in token_usage.py`).toBeDefined();

      const [input, output, cached, largeInput, largeOutput, largeCached] = applied!;
      expect(rate.input, `${rate.model} input`).toBe(input);
      expect(rate.output, `${rate.model} output`).toBe(output);
      if (cached !== undefined) expect(rate.cachedInput, `${rate.model} cached`).toBe(cached);
      if (largeInput !== undefined) {
        expect(rate.largeInput, `${rate.model} large input`).toBe(largeInput);
        expect(rate.largeOutput, `${rate.model} large output`).toBe(largeOutput);
        expect(rate.largeCachedInput, `${rate.model} large cached`).toBe(largeCached);
      }
    }
  });

  it("carries a verification date and a source for every rate", () => {
    for (const rate of MODEL_RATES) {
      expect(rate.verifiedOn, `${rate.model}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rate.source, `${rate.model}`).toMatch(/^https:\/\//);
    }
  });
});
