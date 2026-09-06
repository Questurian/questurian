// There were three copies of the token-rate table: the Python that prices a
// call, the card this file publishes, and a third labelling a button in the
// Prompt2Blog routing panel. The 3.x-to-2.5 sweep left one holding 3.x prices
// under 2.5 names and nothing caught it, because nothing compared them.
// `rates.drift.test.ts` existed to compare this one against that third copy.
// The routing panel was deleted on 2026-09-05 along with the model stacks it
// priced -- v4 has no model picker -- so the third copy is gone and the drift
// test with it. Two remain, and they are the same file: the gateway's
// rates.json, read by the Python and by this card. If a rate table is ever
// written out in a browser bundle again, it needs a test like that one back.
/**
 * What each model costs, and the evidence that it costs that.
 *
 * The collector does not price anything -- reporting apps compute cost and send
 * it. So this is not a pricing engine; it is the published record of the rates
 * those apps are using, next to the date each was checked and the page it was
 * checked against.
 *
 * The numbers are no longer here. They live in the model gateway's
 * `rates.json`, which is also what prices a call, so the card and the code that
 * applies it are the same table rather than two that have to be kept in step.
 * There used to be three copies and they disagreed: the 3.x-to-2.5 sweep left
 * one holding 3.x prices under 2.5 names, quoting $2.00 per million for a model
 * that costs $1.25, and nothing caught it because nothing compared them.
 *
 * Read at runtime rather than imported. The gateway is a Python package outside
 * this app's `rootDir`, and a JSON import would either drag it into the
 * TypeScript build graph or need a copy checked in here -- which is the problem
 * again.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRate, RatesPayload, UnpriceableProvider } from "./rate-types";

export type { ModelRate, RatesPayload, UnpriceableProvider } from "./rate-types";

type RateTableFile = Omit<RatesPayload, "appliedBy">;

export const RATE_TABLE_PATH = join(
  import.meta.dir,
  "../../../../packages/model-gateway/src/model_gateway/rates.json",
);

/**
 * Where the rates are applied, shown on the card so a reader can go and look.
 */
export const APPLIED_BY = "packages/model-gateway/src/model_gateway/rates.json";

function readTable(): RateTableFile {
  // Deliberately unguarded. A missing or malformed rate table is a broken
  // install, not a runtime condition to degrade through, and a card that
  // silently renders nothing is worse than one that fails loudly at boot.
  const parsed = JSON.parse(readFileSync(RATE_TABLE_PATH, "utf8")) as RateTableFile;
  if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
    throw new Error(`${RATE_TABLE_PATH} lists no models`);
  }
  return parsed;
}

let cached: RateTableFile | undefined;

function table(): RateTableFile {
  cached ??= readTable();
  return cached;
}

export function modelRates(): ModelRate[] {
  return table().models;
}

export function unpriceableProviders(): UnpriceableProvider[] {
  return table().unpriceable;
}

export function ratesPayload(): RatesPayload {
  const current = table();
  return {
    verifiedOn: current.verifiedOn,
    models: current.models,
    unpriceable: current.unpriceable,
    appliedBy: APPLIED_BY,
  };
}
