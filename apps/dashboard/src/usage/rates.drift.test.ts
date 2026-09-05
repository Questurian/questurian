import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelRates, ratesPayload } from "./rates";

/**
 * The rates must not disagree with themselves anywhere in the repo.
 *
 * There were three copies of this table: the Python that prices a call, the
 * card this dashboard publishes, and a third labelling a button in the
 * Prompt2Blog routing panel. The 3.x-to-2.5 sweep left one holding 3.x prices
 * under 2.5 names -- quoting $2.00 per million for a model that costs $1.25 --
 * and nothing caught it, because nothing compared them.
 *
 * Two of the three are now one file: the gateway's `rates.json`, read by the
 * Python that applies the rates and by this card. The third cannot be, because
 * it ships in a browser bundle and cannot read a file off disk. So it stays a
 * literal, and this test is what keeps it honest.
 *
 * Parsing TypeScript with a regex is fragile by nature, so a parse that finds
 * nothing fails loudly rather than passing on an empty comparison.
 */

const PROMPT2BLOG_PRICING_TS = join(
  import.meta.dir,
  "../../../ai-blog-writer/apps/frontend/src/features/prompt2blog/constants/prompt2blog-pricing.ts",
);

function ratesInTheRoutingPanel(): Map<string, { input: number; output: number }> {
  const source = readFileSync(PROMPT2BLOG_PRICING_TS, "utf8");
  const start = source.indexOf("const VERTEX_TOKEN_RATES");
  if (start === -1) throw new Error("VERTEX_TOKEN_RATES is no longer declared there");
  // To the brace that closes the declaration, not the first one inside it --
  // every entry is itself an object literal.
  const closes = source.indexOf("\n}", start);
  if (closes === -1) throw new Error("VERTEX_TOKEN_RATES is not closed where expected");
  const table = source.slice(start, closes);

  const found = new Map<string, { input: number; output: number }>();
  const entry = /'([a-z0-9.\-]+)':\s*\{\s*input:\s*([\d.]+),\s*output:\s*([\d.]+)\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(table))) {
    found.set(match[1], { input: Number(match[2]), output: Number(match[3]) });
  }
  return found;
}

describe("the published rate card", () => {
  it("reads the same table the gateway prices calls from", () => {
    const payload = ratesPayload();
    expect(payload.models.length).toBeGreaterThan(3);
    expect(payload.appliedBy).toContain("model-gateway");
  });

  it("carries a verification date and a source for every rate", () => {
    for (const rate of modelRates()) {
      expect(rate.verifiedOn, `${rate.model}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rate.source, `${rate.model}`).toMatch(/^https:\/\//);
    }
  });

  it("still knows which models are live and which are only kept for stored runs", () => {
    // A table where everything is inUse has stopped distinguishing, and the
    // card's "live rates" section becomes a list of history.
    const live = modelRates().filter((rate) => rate.inUse);
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThan(modelRates().length);
  });
});

describe("the Prompt2Blog routing panel's copy", () => {
  const panel = ratesInTheRoutingPanel();

  it("finds the table it is checking against", () => {
    // A regex that silently matched nothing would make the assertions below
    // pass without comparing anything.
    expect(panel.size).toBeGreaterThan(2);
  });

  it("names only models the gateway has rates for", () => {
    const known = new Set(modelRates().map((rate) => rate.model));
    const unknown = [...panel.keys()].filter((model) => !known.has(model));
    expect(unknown).toEqual([]);
  });

  it("agrees with the gateway on every number it quotes", () => {
    for (const rate of modelRates()) {
      const quoted = panel.get(rate.model);
      if (!quoted) continue; // The panel only labels the models it offers.
      expect(quoted.input, `${rate.model} input`).toBe(rate.input);
      expect(quoted.output, `${rate.model} output`).toBe(rate.output);
    }
  });
});
