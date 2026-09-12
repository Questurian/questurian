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
  /** The attempt this row came from, and its position in that attempt's reply.
   *  What a candidate's identity is built out of. */
  sighting_id?: string
  angle: string
  name: string
  district: string
  evidence: string
}

export interface ListicleCandidate {
  /** A hash of this candidate's member sightings. What everything filed
   *  against this candidate keys on — two rows may legitimately show the same
   *  name, and they are never the same candidate. Stable under reordering;
   *  different the moment the membership changes. */
  candidate_id: string
  name: string
  district: string
  evidence: string
  /** Every angle that returned this place. Repeated discovery, reported as
   *  itself — not a verdict that the most-repeated place is the best one. */
  found_by: string[]
  overlap: number
  /** Rows that look like this place and were not folded into it. Shown rather
   *  than resolved: this step cannot tell a second branch from a second
   *  spelling, and folding them loses a venue with nothing on screen to
   *  notice. */
  possible_duplicates: string[]
  /** The same relation by id, for a screen that wants to point at the other
   *  row rather than name it. */
  possible_duplicate_ids?: string[]
  /** Why this place appears to break what the operator left out. Empty when it
   *  does not, or when nothing has checked. */
  barred?: string
  /** 'clear' or 'arguable'. Anything unrecognised is read as 'arguable'. */
  barred_confidence?: string
  /** Whether the cut review covered this row at all. A partial review leaves
   *  rows nobody judged, and an unjudged row must not read as one that came
   *  back clean. */
  cut_reviewed?: boolean
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
  /** The state of the attempt whose result is being shown. */
  state: ListicleAngleState
  /** The state of the most recent attempt, which is not always the one being
   *  shown. A refresh that failed leaves the earlier result on screen and the
   *  failure as the latest attempt, and one field cannot say both. */
  latest_state?: ListicleAngleState
  /** The result on screen was gathered by an earlier attempt than the most
   *  recent one — a refresh that failed over work that stands. */
  showing_earlier?: boolean
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
  /** How many requests actually reached the provider for the work being shown.
   *  One search is not one billable call: the runner retries, and a request
   *  whose answer never arrived may still have been charged for. */
  provider_calls?: number
  /** 'executed' for work this pipeline ran and watched, 'reconstructed' for
   *  work rebuilt from a row stored before attempts had identities. */
  origin?: string
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
  /** Whether a review COVERED every candidate below. False is "nobody
   *  finished looking", which is not "nothing was barred" — read
   *  `cut_review_status` for which of the several ways that can be true. */
  cut_checked?: boolean
  /** 'not_checked' | 'not_needed' | 'complete' | 'partial' | 'failed'. A pool
   *  with no exclusions to check is not the same as one nobody looked at, and
   *  neither is the same as one where a chunk of the reviewing failed. */
  cut_review_status?: string
  /** How many of the candidates a finished chunk actually covered, out of how
   *  many there are. Unequal means part of the list is unjudged. */
  cut_reviewed_count?: number
  cut_expected_count?: number
  /** Chunks of the review that failed. Each one is a call a retry would buy —
   *  and only those, never the chunks that already answered. */
  cut_missing_chunks?: number[]
  /** How many reviewer calls this pool takes. Said before they are bought. */
  cut_chunks_planned?: number
  /** A cut check exists for this run from before verdicts were filed against
   *  candidates. It cannot be applied to these rows — it was keyed by name,
   *  under different pooling rules — and it is not lost either. */
  cut_historical?: boolean
  barred_count?: number
  /** Searches whose latest attempt failed over a result that still stands. The
   *  list is complete and something still went wrong. */
  failed_refreshes?: string[]
  /** Completed searches this run holds that no longer answer the order as it
   *  stands — a correction changed what they ask for. Not lost: filed under
   *  the revision they were bought for. */
  superseded_results?: number
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

/** One saved run, as the shelf lists it.
 *
 *  `found` and `target` are set only once searches have come back. `hidden`
 *  runs are off the shelf and nothing else: they still open and still hold
 *  everything they found. */
export interface ListicleRunSummary {
  run_id: string
  seed: string
  status: string
  stage: 'interview' | 'agreed' | 'searching' | 'searched' | 'unreadable'
  found: number | null
  target: number | null
  created_at: string
  touched_at: string
  hidden: boolean
}

/** The operator's answers to "might be the same place".
 *
 *  A removed place is off the board, not deleted: it is listed at the bottom
 *  and can be put back. A distinct pair is two flagged places judged to be
 *  different, so the warning between them stops showing. */
export interface ListicleBoard {
  /** `duplicate`: the operator said it is the same place as `kept_id`.
   *  `closed`: Google calls it permanently closed.
   *  `not_a_venue`: Google lists it as something that is not a restaurant or
   *  bar, and the operator took it off.
   *  `by_hand`: the operator's own call. `kept_id` is empty for all but
   *  `duplicate`. */
  removed: {
    candidate_id: string
    kept_id: string
    removed_at: string
    reason?: 'duplicate' | 'closed' | 'not_a_venue' | 'by_hand'
  }[]
  distinct_pairs: [string, string][]
}

/** What Google said about one place on the board.
 *
 *  `not_found` means Google answered and nothing matched; `failed` means
 *  there was no answer (no key, a timeout, a refused quota) and the place can
 *  be checked again. The two are never shown the same way. */
export interface ListicleGoogleCheck {
  status: 'found' | 'not_found' | 'failed'
  reason: string
  checked_at: string
  place_id?: string
  google_name?: string
  address?: string
  types?: string[]
  is_venue?: boolean
  /** `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`, or empty when
   *  Google did not say — which is not the same as open. */
  business_status?: string
  rating?: number | null
  rating_count?: number | null
  price_level?: number | null
  /** The operator put the place back after Google called it permanently
   *  closed: Google is overruled, and the closure is no longer shown or acted
   *  on. The rest of what Google said still stands. */
  closed_dismissed?: boolean
  /** The operator put the place back after removing it as "not a restaurant
   *  or bar": Google matched the wrong thing, so the note stops showing. */
  venue_dismissed?: boolean
}

/** Free Google place lookups left this month, as Google counts them across
 *  every app on the Maps key. `available` false means the count could not be
 *  read, and nothing should be assumed about what is left. */
export interface ListiclePlacesAllowance {
  available: boolean
  free: number
  used?: number
  left?: number
  month_start: string
  as_of: string
  reason?: string
}
