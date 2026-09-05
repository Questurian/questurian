/**
 * The shape of the rate card, separate from the code that reads it.
 *
 * `rates.ts` reads the gateway's table off disk, which makes it a server
 * module: it imports `node:fs`, and the browser build has neither those types
 * nor any business having them. The web UI needs the *shape* and nothing else,
 * so the shape lives here where both sides can import it.
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

export interface UnpriceableProvider {
  provider: string;
  reason: string;
  source: string;
}

export interface RatesPayload {
  verifiedOn: string;
  models: ModelRate[];
  unpriceable: UnpriceableProvider[];
  /** Where the rates are applied, so a reader can go and look. */
  appliedBy: string;
}
