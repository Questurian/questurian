/**
 * The listicle interview, as the screen sees it.
 *
 * Mirrors what the server sends, which is deliberately less than it holds:
 * the research digest is thousands of words nobody reads, so it never crosses
 * the wire.
 */

export interface ListicleGrillTurn {
  question_id: string
  ask: string
  pushback: string
  answer: string
  /** Accepting a suggestion is worth less than volunteering an answer, and the
   *  screen has to show the difference or the grill agrees with itself. */
  accepted_as_drafted: boolean
}

export interface ListicleGrillPending {
  question_id: string
  ask: string
  /** Pre-written answer. Arrives in the composer, ready to be corrected. */
  recommendation: string
  /** Set when this question exists because an answer contradicted something. */
  pushback: string
  /** Non-empty only for a question answered by choosing rather than writing.
   *  Today that is the angle question, where every entry becomes one literal
   *  web search and prose would have to be split back into lines. */
  options: ListicleGrillOption[]
}

export interface ListicleGrillOption {
  /** The finished search line. Sent to the web almost verbatim. */
  text: string
  /** Arrives ticked. The rest are the menu you can swap in. */
  recommended: boolean
  /** Options sharing a group return the same places for the same reason.
   *  Empty when the option answers to nothing else. */
  group: string
}

export interface ListicleGrillState {
  run_id: string
  seed: string
  status: 'asking' | 'agreed'
  consensus: string
  markers_covered: string[]
  markers_missing: string[]
  /** What it looked up mid-interview, in order. */
  lookups: string[]
  turns: ListicleGrillTurn[]
  pending: ListicleGrillPending | null
}


/**
 * What the search order found.
 *
 * `found` against `target` is the only question this step exists to answer, so
 * it arrives as a number rather than as something the screen counts for
 * itself.
 */
export interface ListicleCandidate {
  name: string
  district: string
  evidence: string
  /** Every angle that returned this place. More than one is the ranking
   *  signal: a place three searches agree on is the strongest on the list. */
  found_by: string[]
  overlap: number
}

export interface ListicleAngleResult {
  angle: string
  rows: number
  sources: number
  /** A search that never ran. Different from one that ran and found nothing,
   *  and the screen must not present them as the same thing. */
  failed: boolean
  reason: string
}

export interface ListicleSearchResults {
  run_id: string
  target: number
  found: number
  shortfall: number
  rows_returned: number
  angles: ListicleAngleResult[]
  candidates: ListicleCandidate[]
}
