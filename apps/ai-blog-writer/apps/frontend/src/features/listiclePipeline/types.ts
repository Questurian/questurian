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
  /** A descriptive theme, shown as a label. Not a rule: two options sharing a
   *  theme may both be worth searching, and the pair that actually collides is
   *  named per option rather than per group. */
  group: string
  /** Which catalogue entry this was written from. Sent back with the answer so
   *  an edited line does not lose everything the catalogue knew about it. */
  shape: string
  /** What the search is for: broad, distinctive or specific. Decides how many
   *  places it is asked for. */
  role: string
}

/** One chosen line, as the screen knows it.
 *
 *  Sent alongside the answer text rather than instead of it. The transcript
 *  keeps what the operator wrote, because that is what was agreed to; this
 *  carries what the sentence cannot — which menu entry it came from, whether
 *  it was edited, whether they wrote it themselves. */
export interface ListicleAngleSelection {
  text: string
  angle_id?: string
  shape_key?: string
  group?: string
  role?: string
  edited?: boolean
  custom?: boolean
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
 * The agreement, in the form the searches actually run from.
 *
 * Read separately from the interview because the two used to be one paragraph
 * with two readings: the screen showed a search order for twenty items and the
 * searches ran for forty, and there was nowhere to look that would have said
 * so.
 */
export interface ListicleOrderAngle {
  angle_id: string
  text: string
  shape_key: string
  group: string
  role: string
  /** How many places this search is asked for. Follows the role. */
  wanted: number
  /** The operator changed the wording. What the catalogue knew about this
   *  angle is no longer known to be true of it. */
  edited: boolean
  custom: boolean
  /** What this search bought the last time it ran about the same subject —
   *  before this time is paid for. Empty on a first run, which is most of
   *  them. Said and never acted on: no angle is dropped because of it. */
  last_time?: string
}

export interface ListicleAngleConflict {
  angle_id: string
  angle_text: string
  /** One plain sentence saying why this search and the cut disagree. */
  why: string
}

export interface ListicleOrder {
  run_id: string
  revision: number
  kind: string
  place: string
  target_count: number
  standard: string
  exclusions: string
  /** Where the number came from — answered, accepted, corrected, read off the
   *  title, or a default. */
  count_source: string
  count_ambiguous: boolean
  count_note: string
  /** One line per marker the interview answered more than once, saying what
   *  was done about it. Empty for an interview that asked each thing once,
   *  which is the normal case. */
  answer_notes: string[]
  /** Approved searches that look like they will return places this same order
   *  bars. Found before anything is spent; nothing is removed. */
  angle_conflicts?: ListicleAngleConflict[]
  /** False means nobody looked — which is not the same as looked and found
   *  nothing. Every order stored before this check existed is in that state. */
  conflicts_checked?: boolean
  capacity: number
  capacity_warning: string
  summary: string
  angles: ListicleOrderAngle[]
}


/**
 * What the search order found.
 *
 * `found` against `target` is the only question this step exists to answer, so
 * it arrives as a number rather than as something the screen counts for
 * itself.
 */
export interface ListicleSighting {
  angle: string
  name: string
  district: string
  evidence: string
}

export interface ListicleCandidate {
  name: string
  district: string
  evidence: string
  /** Every angle that returned this place. Repeated discovery, reported as
   *  itself — not a verdict that the most-repeated place is the best one. */
  found_by: string[]
  overlap: number
  /** Rows that look like this place and were not merged into it, because a
   *  district or a bracketed qualifier said they might be somewhere else. */
  possible_duplicates: string[]
  /** Why this place appears to break what the operator left out. Empty when it
   *  does not, or when nothing has checked. */
  barred?: string
  /** 'clear' or 'arguable'. Anything unrecognised is read as 'arguable'. */
  barred_confidence?: string
  /** Every row exactly as a search returned it. Kept so a merge can be
   *  checked: two angles found this place for two different reasons. */
  sightings: ListicleSighting[]
}

export type ListicleAngleState =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export interface ListicleAngleResult {
  angle_id: string
  angle: string
  shape: string
  group: string
  role: string
  wanted: number
  edited: boolean
  custom: boolean
  state: ListicleAngleState
  rows: number
  sources: number
  /** A search that never came back. Different from one that ran and found
   *  nothing, and the screen must not present them as the same thing. */
  failed: boolean
  reason: string
  /** Contribution, against the whole pool: everything this angle found, how
   *  much of it other angles found too, and what only this one found. */
  found: number
  shared: number
  exclusive: number
  gathered_at: string
  /** The publications this search actually reached, by name. Every citation
   *  URL Google returns is an opaque redirect, so without these there is no
   *  way to tell whether a search written to run in the local language reached
   *  local press or stopped at the visitor guides. */
  sources_named: string[]
  /** This result was gathered under an earlier revision of the order and still
   *  answers the request being made. */
  reused: boolean
}

export interface ListicleSearchResults {
  run_id: string
  revision: number
  target: number
  found: number
  shortfall: number
  rows_returned: number
  running: boolean
  complete: boolean
  /** How many candidates have a possible duplicate standing beside them. The
   *  distinct count is provisional while this is above zero. */
  uncertain_identity: number
  capacity: number
  capacity_warning: string
  /** The searches that finished and returned no place the others missed. A
   *  fact about this run, not a verdict: a search with nothing exclusive may
   *  be the coverage everything else is being checked against. */
  empty_handed?: string[]
  /** Whether anything judged this revision's places against the cut. False is
   *  "nobody looked", not "nothing was barred". */
  cut_checked?: boolean
  barred_count?: number
  order: {
    kind: string
    place: string
    target_count: number
    standard: string
    exclusions: string
    count_source: string
    count_ambiguous: boolean
    count_note: string
    answer_notes?: string[]
  }
  angles: ListicleAngleResult[]
  candidates: ListicleCandidate[]
  /** A result stored before work was recorded per angle. Readable, and not
   *  retryable at the angle level. */
  legacy?: boolean
}
