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

/* ------------------------------------------------------------------ *
 * Per-place research.
 *
 * Three things the screen has to keep apart and used to conflate:
 * how a request WENT (execution), what was FOUND (evidence), and what a
 * person has DECIDED about what was found (curation). A failed call with four
 * good findings still on the profile is all three at once, and one status
 * field cannot say it.
 * ------------------------------------------------------------------ */

/** One reason a place cannot be researched yet.
 *
 *  `where` says which screen fixes it: `prep` is the card itself, `board` is
 *  the duplicate or removal workflow, `google` is a check nobody has bought,
 *  `execution` clears itself when something finishes. */
export interface ListicleResearchBlocker {
  code: string
  message: string
  where: 'prep' | 'board' | 'google' | 'execution' | string
}

/** Whether one place can be researched, computed on the server.
 *
 *  The card never decides this for itself. A second, client-side version of
 *  the rule is how a button comes back enabled over a board that has moved. */
export interface ListicleReadiness {
  candidate_id: string
  ready: boolean
  blockers: ListicleResearchBlocker[]
  /** Required checks only. An optional link is not part of this, so a card
   *  with an empty TripAdvisor box still reads as finished. */
  required_total: number
  required_done: number
  progress: number
  prep_version: number
  identity_fingerprint: string
  status_fingerprint: string
  exclusion_fingerprint: string
  cut_fingerprint: string
  /** What Google holds, printed beside the tick so a confirmation is made
   *  about a named place rather than about a checkbox. */
  google_name: string
  google_address: string
  place_id: string
  /** Other cards still on the board that Google resolves to this same
   *  building. Name matching cannot find these — "Wingman [Barranco]" and
   *  "Wigman Alitas Inc." share almost nothing — so the screen offers the
   *  duplicate decision over them from here instead. */
  identity_twins: string[]
}

export interface ListicleSourceLink {
  label: string
  url: string
}

/** What somebody has said about one card, as stored. Survives a reload. */
export interface ListiclePrep {
  run_id: string
  candidate_id: string
  version: number
  identity_confirmed: boolean
  identity_confirmed_at: string
  identity_confirmed_by: string
  open_confirmed: boolean
  open_confirmed_at: string
  open_confirmed_by: string
  status_note: string
  exclusion_decision: string
  exclusion_reason: string
  exclusion_at: string
  cut_confirmed: boolean
  cut_confirmed_at: string
  tripadvisor_url: string
  source_links: ListicleSourceLink[]
  updated_at: string
}

/** What a card says about research that exists. Counts, never a score. */
export interface ListicleProfileSummary {
  profile_id: string
  name: string
  place_id: string
  district: string
  findings_total: number
  findings_this_topic: number
  /** Of those, how many check out. Same rows, so the two sit side by side. */
  ready_this_topic?: number
  kept: number
  unreviewed: number
  unattributed: number
  open_questions: number
  /** Topics this place has material under, other than this list's. What makes
   *  "saved research available" a true sentence on a second list. */
  other_topics: string[]
  last_research_at: string
  last_state: string
  angles: number
  other_runs: {
    run_id: string
    candidate_id: string
    name: string
    linked_at: string
  }[]
}

/** `completed_empty` is not a failure: the request ran and nothing is
 *  published. `response_invalid` is not a failure either — something came
 *  back and it was not the shape asked for. `interrupted` may already have
 *  been charged for. */
export type ListicleAttemptState =
  | 'running'
  | 'completed'
  | 'completed_empty'
  | 'failed'
  | 'response_invalid'
  | 'interrupted'

/** One provider call inside one research action.
 *
 *  A list rather than a single model/usage pair on the attempt, because one
 *  press makes up to two generations and both are charged. A card showing one
 *  model name is a card showing half the bill. */
export interface ListicleCallReceipt {
  /** `discovery` or `extraction`. What the call was for, not who served it. */
  stage: string
  model: string
  asked_for: string
  grounded: boolean
  /** `ok`, `failed`, `invalid` or `skipped`. A skipped call still has a
   *  receipt, with its reason: "no extraction ran" and "extraction found
   *  nothing" are different facts about a packet. */
  outcome: string
  reason: string
  /** Why the provider stopped. Empty means it did not say, which is itself
   *  worth seeing on a truncated answer. */
  finish_reason: string
  usage: Record<string, number>
  duration_seconds: number | null
}

/** One page a research action tried to open. */
export interface ListicleReadPage {
  requested_url: string
  /** Where the redirects ended — the publisher's own address, for a grounding
   *  redirect. This is the link a citation should carry. */
  final_url: string
  /** `ok`, `blocked`, `not_found`, `unsupported_type`, `budget_exhausted`… An
   *  unreadable page is an access gap, never evidence that nothing exists. */
  state: string
  http_status: number | null
  title: string
  /** What the page itself says it was published on. Never the day we read it. */
  published_at: string
  retrieved_at: string
  content_hash: string
  byte_count: number
  /** `lead`, `discovered`, `operator`, or `google_reviews` — the last of
   *  which was never fetched over HTTP and spends none of the page budget. */
  origin: string
  /** True when the text came from a page this attempt already held rather than
   *  from a second fetch. A refresh must not present cached text as newly
   *  checked. */
  reused: boolean
  /** True when the source belongs to this branch by identity rather than by an
   *  address printed on it — a Google review hangs off the Place ID, and the
   *  Place ID is the branch. */
  branch_anchored: boolean
  note: string
  chars: number
}

export interface ListicleAttemptSummary {
  attempt_id: string
  run_id: string
  candidate_id: string
  profile_id: string
  mode: string
  state: ListicleAttemptState
  reason_code: string
  reason: string
  findings_added: number
  findings_seen: number
  open_questions: string[]
  started_at: string
  finished_at: string
  model: string
  running: boolean
  receipts: ListicleCallReceipt[]
  /** Provider calls actually made. The ceiling is two. */
  generations: number
  grounded_calls: number
  pages_read: number
  pages_attempted: number
  /** Claims about this list's subject that passed checking. Separate from
   *  `state` on purpose: a request that ran is not a request that found
   *  anything, and the screen this replaces showed one number for both. */
  evidence_ready: number
  /** Every claim that checks out, about the subject or not. */
  evidence_ready_total?: number
  strategy_version: string
  pilot: string
  baseline_attempt_id: string
}

export interface ListicleAttemptDetail extends ListicleAttemptSummary {
  topic: string
  /** What this request asked to look for. Ours, not the provider's. */
  requested_queries: string[]
  /** What the provider says it actually searched. Evidence; often empty. */
  actual_queries: string[]
  validation_issues: string[]
  coverage: { topic: string; category: string; state: string; note: string }[]
  usage: Record<string, number>
  duration_seconds: number | null
  prompt_version: string
  gap_text: string
  raw_response: string
  prompt: string
  /** The request, worked out before anything was bought. Readable without
   *  reading the prompt. */
  brief: {
    version?: string
    intent?: string
    /** The words this list's subject is actually written about in -- `alitas`
     *  rather than `chicken wings`. Derived from the run's own search evidence,
     *  never translated. Used to ask the reviews API for reviews about the
     *  subject, and to rank what comes back. */
    subject_terms?: string[]
    priority_questions?: string[]
    known_source_leads?: { url: string; origin: string; note: string }[]
    illustrative_queries?: string[]
    discovery_leads?: {
      snippet: string
      angle: string
      attempt_id: string
      status: string
    }[]
    scope_notes?: string[]
    completion_criteria?: string[]
    [key: string]: unknown
  }
  pages: ListicleReadPage[]
  /** What the search said before anything was opened. A provider snippet is a
   *  transcription, and it never becomes a citation. */
  discovery: {
    pages?: {
      url: string
      publisher: string
      title: string
      published_at: string
      provider_snippet: string
      scope: string
      why: string
      site?: string
      /** `search`, `search_only`, or `none`: described but matched to no
       *  search result, and therefore never opened. */
      address_from?: string
    }[]
    searched?: string[]
    not_found?: string[]
    notes?: string[]
    issues?: string[]
  }
  /** Arithmetic over checked evidence, kept apart from how the search went. */
  evidence_summary: {
    subject_evidence_ready?: number
    evidence_ready_total?: number
    review_needed?: number
    unsupported?: number
    attributable_opinion?: number
    business_only?: number
    pages_read?: number
    pages_attempted?: number
    pages_unreachable?: { url: string; state: string }[]
    unresolved_questions?: string[]
    priority_questions?: string[]
    by_category?: Record<string, number>
  }
}

export interface ListicleResearchCard {
  entry?: {
    ready: boolean
    stale: boolean
    blurb: { text: string; stale: boolean }
  } | null
  candidate_id: string
  name: string
  district: string
  prep: ListiclePrep
  readiness: ListicleReadiness
  profile: ListicleProfileSummary | null
  last_attempt: ListicleAttemptSummary | null
}

export interface ListicleResearchBoard {
  run_id: string
  revision: number
  /** The key this run's findings are filed under, derived from what the
   *  interview agreed the list is about. */
  topic: string
  topic_label: string
  exclusions: string
  active_attempt: ListicleAttemptSummary | null
  reviews_budget: ListicleReviewsBudget
  /** The words this list's subject is actually written about in -- `alitas`
   *  rather than `chicken wings`. Read off the run's own search evidence. */
  subject_terms: string[]
  cards: ListicleResearchCard[]
}

/** What is left of the free customer-reviews allowance.
 *
 *  The reviews API is billed per review returned against a free cap, so this
 *  is a hard stop rather than a running cost: at zero, research still runs but
 *  buys no reviews. Shown on the board because that is where the button is. */
export interface ListicleReviewsBudget {
  /** False when the backend has no reviews key: research runs, buys none. */
  key_configured?: boolean
  /** The cap, in review objects. */
  ceiling: number
  spent: number
  /** The spendable number: the stricter of our ledger and RapidAPI's own count. */
  remaining: number
  ours_remaining: number
  /** RapidAPI's count, or null when no answer has carried the header yet.
   *  Null is "not known", never "none left". */
  reported_remaining: number | null
  reported_limit: number | null
  /** `remaining` said in the unit decisions are made in. */
  places_left: number
  exhausted: boolean
  /** The two counters have drifted, which usually means another app is
   *  spending the same key. Worth showing rather than resolving. */
  disagrees: boolean
  calls: number
  last_call_at: string
}

/** One source under one finding, with the source's own dates beside it. */
export interface ListicleFindingEvidence {
  source_id: string
  supporting_excerpt: string
  evidence_scope: string
  url: string
  publisher: string
  title: string
  /** When the source was published. Empty means unknown, which is not the
   *  same as recent. */
  published_at: string
  /** When we read it. Never used to fill in the line above. */
  retrieved_at: string
}

export interface ListicleFinding {
  finding_id: string
  text: string
  kind: string
  categories: string[]
  topics: string[]
  scope: string
  temporal_type: string
  event_date: string
  source_published_at: string
  valid_until: string
  expired: boolean
  curation: 'unreviewed' | 'kept' | 'discarded' | string
  origin: string
  version: number
  /** What the checks made of it. `evidence_ready` means a person can open the
   *  page and find the sentence — a lower bar than true, and the name says so.
   *  `not_checked` is the honest answer for a typed finding and for anything
   *  stored before checking existed. */
  validation:
    | 'evidence_ready'
    | 'review_needed'
    | 'unsupported'
    | 'not_checked'
    | string
  /** Why it is not evidence-ready, in the words a person needs. */
  validation_notes: string[]
  /** Who is behind the claim. A menu is the business talking about itself. */
  who_said_it: string
  who_name: string
  /** Which channel a price was seen on. A delivery price is not the price at
   *  the table. */
  channel: string
  /** `attributed` or `incomplete`. Derived from whether it actually has a
   *  source — never asserted, and never filled in from the search's own URL
   *  list. */
  attribution: string
  author: string
  observed_at: string
  attempt_id: string
  created_at: string
  updated_at: string
  evidence: ListicleFindingEvidence[]
  revisions: {
    revision_id: string
    version: number
    editor: string
    origin: string
    changed_at: string
    before: Record<string, unknown>
    after: Record<string, unknown>
  }[]
}

export interface ListiclePossibleAngle {
  angle_id: string
  label: string
  topic: string
  supporting_finding_ids: string[]
  author: string
  archived: boolean
  created_at: string
}

export interface ListicleProfileResearch {
  profile_id: string
  name: string
  city: string
  district: string
  place_id: string
  topics: string[]
  topic: string
  findings: ListicleFinding[]
  sources: {
    source_id: string
    url: string
    publisher: string
    source_type: string
    title: string
    published_at: string
    retrieved_at: string
  }[]
  possible_angles: ListiclePossibleAngle[]
  history: ListicleAttemptSummary[]
  coverage: { topic: string; category: string; state: string; note: string }[]
  open_questions: string[]
  runs: {
    run_id: string
    candidate_id: string
    name: string
    linked_at: string
  }[]
}

export interface EntryResearchSlots {
  why_it_belongs: string | null
  what_to_order_or_notice: string[]
  visit_character: string | null
  useful_detail: string | null
  story_depth: string | null
  caveat: string | null
}
export type EntryResearchField = keyof EntryResearchSlots
export interface EntryResearchWorkspace {
  imports?: {
    import_key: string
    created_at: string
    stale_or_rejected_claims: { claim: string; reason: string }[]
    open_questions: string[]
  }[]
  profile_id: string
  version: number
  context_key: string
  order_revision: number
  slots: EntryResearchSlots
  supporting_findings: Partial<Record<EntryResearchField, string[]>>
  ready: boolean
  stale: boolean
  prompt: string
  title?: string
  place_name?: string
  blurb?: EntryBlurb
}
/** One place's blurb. `prompt` is built from the current brief; `stale` means the brief changed since the blurb was saved. */
export interface EntryBlurb {
  version: number
  text: string
  prompt: string
  stale: boolean
}
export interface ExternalResearchFact {
  id: string
  category: string
  text: string
  why_useful: string
  scope: 'branch' | 'brand' | 'unknown'
  temporal_type: 'current' | 'historical' | 'dated_observation' | 'unknown'
  observed_or_published_at: string | null
  source: { url: string; publisher: string; title: string }
}
export interface ResearchImportPreview {
  version: number
  context_key: string
  can_apply: boolean
  warnings: string[]
  changes: {
    field: EntryResearchField
    before: string | string[] | null
    after: string | string[] | null
  }[]
  packet: {
    identity_match: {
      status: 'matched' | 'uncertain' | 'wrong_branch'
      note: string
    }
    fit: {
      status: 'strong' | 'usable' | 'weak'
      why: string
      source_urls: string[]
    }
    facts: ExternalResearchFact[]
    editorial_take: EntryResearchSlots
    stale_or_rejected_claims: { claim: string; reason: string }[]
    open_questions: string[]
  }
}

/** Where one place stands in Location Manager, matched on Google's Place ID.
 *  `unchecked` means Location Manager could not be asked -- never "missing". */
export type LocationManagerStatus =
  | 'present'
  | 'several'
  | 'missing'
  | 'no_place_id'
  | 'no_type'
  | 'unchecked'

/** The four listicle types. A run is exactly one, and a place only counts as
 *  in Location Manager when it is there as that type. */
export type ListicleType = 'dining' | 'nightlife' | 'accommodations' | 'attractions'

export interface LocationManagerPlace {
  status: LocationManagerStatus
  place_id: string
  /** Matches in the run's type. Only these count. */
  locations: { id: number; name: string; category: string }[]
  /** Matches in other types: shown for context, never counted. */
  elsewhere: { id: number; name: string; category: string }[]
  /** What Location Manager's Add form is opened with. */
  prefill: { name: string; address: string; tripadvisor_url: string }
}

export interface LocationManagerBoard {
  run_id: string
  /** Empty until the operator chooses one. */
  listicle_type: ListicleType | ''
  available: boolean
  error: string
  places: Record<string, LocationManagerPlace>
}
