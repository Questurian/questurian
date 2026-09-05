/**
 * What each model costs, and the evidence that it costs that.
 *
 * The collector does not price anything -- reporting apps compute cost and send
 * it. So this table is not a pricing engine; it is the published record of the
 * rates those apps are using, next to the date each was checked and the page it
 * was checked against.
 *
 * That is the whole point. A rate nobody has verified is a number that looks
 * like evidence, and an unverified rate that happens to be wrong makes every
 * cost built on it wrong in the same direction, silently. `gemini-2.5-flash-lite`
 * reached production priced from memory; it turned out to be right, which is
 * luck rather than a process.
 *
 * Kept in sync with `apps/ai-blog-writer/apps/backend/app/shared/token_usage.py`,
 * which is where the numbers are actually applied. `rates.drift.test.ts` reads
 * that file and fails if the two disagree, so this cannot quietly become a
 * second, wrong table.
 */

export interface ModelRate {
  model: string;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens, when the model supports caching. */
  cachedInput?: number;
  /** Rates that apply above the long-context threshold, when the model tiers. */
  largeInput?: number;
  largeOutput?: number;
  largeCachedInput?: number;
  /** Input tokens above which the large-context rates apply. */
  largeContextThreshold?: number;
  /** ISO date the rate was last checked against `source`. */
  verifiedOn: string;
  source: string;
  /** Set when the rate is known to change on a date. */
  note?: string;
  /** False for models nothing calls any more, kept to price stored runs. */
  inUse: boolean;
}

const GEMINI_API_PRICING = "https://ai.google.dev/gemini-api/docs/pricing";
const VERIFIED = "2026-09-04";

export const MODEL_RATES: ModelRate[] = [
  {
    model: "gemini-2.5-pro",
    input: 1.25,
    output: 10.0,
    cachedInput: 0.125,
    largeInput: 2.5,
    largeOutput: 15.0,
    largeCachedInput: 0.25,
    largeContextThreshold: 200_000,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: true,
  },
  {
    model: "gemini-2.5-flash",
    input: 0.3,
    output: 2.5,
    cachedInput: 0.03,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: true,
  },
  {
    model: "gemini-2.5-flash-lite",
    input: 0.1,
    output: 0.4,
    cachedInput: 0.01,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: true,
  },
  // Below here: nothing calls these any more. They stay because stored runs
  // were priced with them, and a rate table that forgets is a receipt that
  // changes after the fact.
  {
    model: "gemini-3.1-pro-preview",
    input: 2.0,
    output: 12.0,
    cachedInput: 0.2,
    largeInput: 4.0,
    largeOutput: 18.0,
    largeCachedInput: 0.4,
    largeContextThreshold: 200_000,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: false,
  },
  {
    model: "gemini-3.7-flash",
    input: 0.75,
    output: 3.75,
    cachedInput: 0.075,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    note: "Introductory rate. Doubles to $1.50 / $7.50 on 2027-01-01.",
    inUse: false,
  },
  {
    model: "gemini-3.5-flash",
    input: 1.5,
    output: 9.0,
    cachedInput: 0.15,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: false,
  },
  {
    model: "gemini-3.5-flash-lite",
    input: 0.3,
    output: 2.5,
    cachedInput: 0.03,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: false,
  },
  {
    model: "gemini-3.1-flash-lite",
    input: 0.25,
    output: 1.5,
    cachedInput: 0.025,
    verifiedOn: VERIFIED,
    source: GEMINI_API_PRICING,
    inUse: false,
  },
];

/**
 * Providers billed per call rather than per token.
 *
 * Listed because their absence from the rate table is otherwise indistinguishable
 * from an oversight. Places calls show in the dashboard with a duration and no
 * cost, and that is correct rather than missing -- there is no token count to
 * price, and the bill only exists in Google Cloud billing.
 */
export const UNPRICEABLE_PROVIDERS = [
  {
    provider: "google-places",
    reason:
      "Billed per request and per field group, not per token. Atmosphere fields " +
      "(rating, reviews, price_level) are charged on top of the basic lookup.",
    source: "https://developers.google.com/maps/billing-and-pricing/pricing",
  },
  {
    provider: "claude-cli",
    reason:
      "Runs on a Claude subscription, not per-token billing. The CLI reports a " +
      "cost figure that does not correspond to money owed, so it is ignored.",
    source: "",
  },
];

export function ratesPayload() {
  return {
    verifiedOn: VERIFIED,
    models: MODEL_RATES,
    unpriceable: UNPRICEABLE_PROVIDERS,
    appliedBy: "apps/ai-blog-writer/apps/backend/app/shared/token_usage.py",
  };
}
