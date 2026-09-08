/**
 * Where one article stands before writing begins.
 *
 * This mirrors what `GET /prompt2blog/intake/{run_id}` returns. The run holds
 * all of it, so a closed tab loses nothing: the page asks where it stands and
 * carries on.
 */

/** One question, and the answer the grill expects to hear. */
export interface IntakeQuestion {
  question_id: string
  topic: string
  ask: string
  /** Nobody faces a blank. Accept it, or correct it. */
  recommendation: string
  /** Set when this question exists to resolve a contradiction. */
  pushback: string
  /** Which brief marker this question exists to settle. */
  asks_about: string
}

/** A question and what was actually typed, kept word for word. */
export interface IntakeTurn {
  question_id: string
  topic: string
  ask: string
  recommendation: string
  pushback: string
  answer: string
  /**
   * Whether the suggestion was sent back untouched.
   *
   * The grill is told, because otherwise it reads its own sentence returning
   * as a confident answer and agrees with itself (ADR 0033). Shown here for
   * the same reason: accepting is agreement, not something you said.
   */
  accepted_as_drafted: boolean
}

export interface IntakeGrill {
  status: 'asking' | 'agreed' | ''
  seed: string
  turns: IntakeTurn[]
  pending: IntakeQuestion | null
  /** The played-back summary. Agreeing with it is the stop condition. */
  consensus: string
  /**
   * What the brief has and still needs. The grill stops when nothing is
   * missing, so this is the honest answer to "how far along am I" — which a
   * question count never was.
   */
  markers_covered: string[]
  markers_missing: string[]
}

export interface IntakeBrief {
  brief_fingerprint: string
  seed: string
  location: string
  form_id: string
  topic_module_ids: string[]
  primary_reader: string
  reader_tags: string[]
  reader_question: string
  spine: string
  outcome: string
  fails_if: string
  must_name: string[]
  /** Shown back in full so you can see what the system thinks you said. */
  material: { kind: string; statement: string; note?: string }[]
}

/**
 * Where the writing stands, or how it stopped.
 *
 * Deliberately without a stage name or a percentage. The writer researches and
 * writes inside one call, and the transport reports how many turns that took
 * only after it finishes, so any progress number here would be invented.
 */
export interface IntakeGeneration {
  state: 'running' | 'succeeded' | 'failed'
  attempt_id: string
  /** How many times this run has been written. A retry never deletes a draft. */
  attempts: number
  started_at: string
  finished_at: string | null
  /** quota_exhausted, not_connected, provider_unavailable, unusable_response. */
  failure: string | null
  message: string | null
  /** What Claude sent back when it was not an article. Paid for, so kept. */
  raw: string | null
  requested_model: string | null
  /** What actually answered. A substitution shows up as a difference. */
  served_model: string | null
  effort: string | null
  /** Provider round trips. "One writer" is not "one billable call". */
  turns: number | null
  elapsed_seconds: number | null
  cost_usd: number | null
  tool_denials: string[]
  /** `written` here, or `pasted` when the article was brought in from elsewhere. */
  source: 'written' | 'pasted'
  /** Who the operator says wrote a pasted draft. Their word, not a reading. */
  written_by: string | null
  /** True while an earlier good draft survives a later failed attempt. */
  has_draft: boolean
  headline: string | null
  word_count: number | null
  /** What could not be read cleanly out of the reply. */
  parse_issue: string | null
}

/** The article itself. Fetched once, when there is one to read. */
export interface IntakeDraft {
  run_id: string
  attempt_id: string
  headline: string
  article_markdown: string
  research_note: string
  parse_issue: string
  content_hash: string
  word_count: number
  /** The whole reply. Nothing derived is authoritative over it. */
  raw: string
}

/**
 * Where the detector stands, for a page that may have been reloaded.
 *
 * Asked for on the same poll as everything else, so it carries counts and a
 * receipt rather than the findings themselves. Reading it starts nothing.
 */
export interface IntakeReview {
  state: 'running' | 'succeeded' | 'failed'
  review_id: string
  /** How many reads this run has had. A retry never deletes a review. */
  reviews: number
  started_at: string
  finished_at: string | null
  /** quota_exhausted, not_connected, provider_unavailable, unusable_response. */
  failure: string | null
  message: string | null
  /** What Claude sent back when it was not a review. Paid for, so kept. */
  raw: string | null
  /** True while an earlier good read survives a later failed one. */
  has_review: boolean
  /**
   * True when the read that exists is about an article that has since been
   * rewritten. Its quotes point at paragraphs that no longer exist, so it is
   * shown as history rather than as a review of what is on screen.
   */
  stale: boolean
  reviewed_draft_version: string | null
  finding_count: number
  served_model: string | null
  turns: number | null
  elapsed_seconds: number | null
  cost_usd: number | null
  parse_issue: string | null
}

/**
 * One thing the editor found wrong with one draft.
 *
 * `label` is the model's own words, not a value from a list in the code. A
 * fixed vocabulary would decide in advance what kinds of fault exist, which is
 * the thing this phase is investigating; the labels that repeat on their own
 * are the real categories.
 */
export interface IntakeFinding {
  finding_id: string
  label: string
  severity: 'serious' | 'notable' | 'minor'
  /** The passage this is about, copied out of the article by the editor. */
  quote: string
  problem: string
  /** True when the fault is not in one passage. */
  whole_article: boolean
  /** The operator's own call, kept beside the finding and never over it. */
  verdict?: 'agreed' | 'not_a_fault'
  verdict_at?: string
}

/** One whole read, fetched once when there is one to show. */
export interface IntakeReviewResult {
  run_id: string
  review_id: string
  draft_version: string
  findings: IntakeFinding[]
  verdict: string
  parse_issue: string
  /** The whole reply. Nothing derived is authoritative over it. */
  raw: string
  served_model: string | null
  turns: number | null
  elapsed_seconds: number | null
  cost_usd: number | null
}

/**
 * The frozen writing assignment, exactly as the writer will receive it.
 *
 * `text` is the whole prompt rather than a summary. Approving a summary of an
 * assignment nobody has read is how the old pipeline shipped a 41-prohibition
 * instruction stack that no operator ever saw (ADR 0036).
 */
export interface IntakeWriterPrompt {
  prompt_fingerprint: string
  brief_fingerprint: string
  template_version: string
  style_version: string
  target_word_count: number
  research_date: string
  characters: number
  text: string
}

export interface IntakeRequirement {
  requirement_id: string
  question: string
  /**
   * What this question is for: the sentence, comparison or decision its answer
   * makes possible. Empty when the planner did not say, which is worth reading
   * as a signal — a question that cannot name its job in the article is
   * usually one the article has no room for.
   */
  purpose: string
  kind: 'load_bearing' | 'texture'
  /**
   * How exact the article needs this. `exact` for a figure a reader acts on,
   * `approximate` for one they only need the size of.
   */
  precision: 'exact' | 'approximate'
  /**
   * Set when the question reads as two questions bundled into one. Advisory —
   * whether two clauses have two answers is a judgement, and the operator is
   * the one who can tell.
   */
  bundled_note: string
}

/**
 * What this plan is about to cost, beside the decision that changes it.
 *
 * Null when the run has no token accounting. An unmetered run is not a free
 * one, but a cost nobody can measure is not one to state as fact.
 */
export interface IntakeBudgetProjection {
  question_count: number
  spent: number
  projected_research: number
  projected_writing: number
  projected_total: number
  repair_reserve: number
  budget: number
  /**
   * What this plan is projected to bill, and the budget it is judged against.
   * Money, not tokens: two thirds of a run's tokens are subscription Claude,
   * which bills nothing.
   */
  projected_cost_usd: number
  cost_budget_usd: number
  /** False means the run publishes but cannot pay for a repair pass. */
  repair_affordable: boolean
  questions_that_fit: number
  ceiling: number
  /** False means the run dies part-way through research. There is no article. */
  can_finish: boolean
  questions_that_finish: number
  note: string
  /**
   * How many facts an article this long has room for. Zero when no length was
   * resolved. This is the budget nothing used to report: a plan can be well
   * inside its money budget and still buy research the article has no room to
   * print.
   */
  fact_budget: number
  /** Empty when `fact_budget` is zero. */
  editorial_note: string
}

export interface IntakeWorkOrder {
  work_order_fingerprint: string
  brief_fingerprint: string
  primary_subject: string
  requirements: IntakeRequirement[]
  load_bearing_count: number
  texture_count: number
  cut_warnings: string[]
  budget_projection: IntakeBudgetProjection | null
}

export interface IntakeCoverage {
  can_write: boolean
  /** ready_to_write | premise_refuted | load_bearing_unanswered | nothing_worth_reading */
  reason: string
  unsupported_load_bearing: string[]
  refuted_assumptions: string[]
  /** False when nothing in the dossier would be a pleasure to read. */
  has_texture: boolean
  findings: string[]
}

/** One fact research found, and where it came from. */
export interface ResearchClaim {
  claim_id: string
  text: string
  confidence: string
  venue: string
  venue_note: string
  sources: { title: string; url: string; source_type: string }[]
}

/** What came back for one question. */
export interface ResearchFinding {
  status: string
  gap: string
  claims: ResearchClaim[]
}

export interface IntakeResearch {
  work_order_fingerprint: string
  source_count: number
  claim_count: number
  requirement_status: Record<string, string>
  /** What was actually found, per question. */
  findings: Record<string, ResearchFinding>
  conflicts: string[]
  coverage: IntakeCoverage
}

/** What the ten searches are doing, while they do it. */
export interface IntakeResearchProgress {
  phase: 'gathering' | 'structuring'
  done: number
  total: number
  /**
   * The last question to come back, not the one being searched: the searches
   * run concurrently, so there is no single current one.
   */
  last_question_back: string
}

/**
 * What the writer is doing, or what it produced.
 *
 * Every field here was already on the run and none of it reached the page, so
 * a write looked dead for five minutes and a finished article then sat unseen
 * for twenty more.
 */
export interface IntakeWriting {
  state: 'running' | 'completed' | 'failed' | string
  stage: string
  /** The stage in words. "Writing the article", not "stage_v3_compose". */
  stage_label: string
  error: string | null
  updated_at: string
  final_title: string | null
  word_count: number | null
  /** ready_for_staging | needs_revision. Advisory; it never blocked. */
  pipeline_status: string | null
  readiness_blockers: string[]
  constraint_checks: Record<string, unknown>
  outline_warning?: string | null
}

/**
 * One question holding the run up, with what research did find.
 *
 * Rarely a blank. Run 76b36468 was stopped holding a name, a URL and two
 * founders, missing only a price the co-op does not publish.
 */
export interface GateQuestion {
  requirement_id: string
  question: string
  kind: string
  status: string
  gap: string
  found: string[]
  /** Why research fell short, in its own words. `unknown` on older runs. */
  cause: string
  /**
   * Which move fits, and why, in words meant for the person deciding. Null
   * when research did not say why — the screen then shows what it always
   * showed, four moves and no opinion.
   */
  suggestion: { move: string; why: string } | null
}

/**
 * Somewhere the article would send a reader.
 *
 * Research can confirm a site resolves and a price is published. It cannot see
 * that the last post was 2024 and the checkout is janky, which is not a fact on
 * a page but the absence of recent activity.
 */
export interface VenueToCheck {
  claim_id: string
  venue: string
  text: string
  urls: string[]
  note: string
  /**
   * Questions this place is the last thing holding up. Dropping it puts them
   * back behind the gate, which the screen has to say before the click rather
   * than after it.
   */
  sole_support_for: string[]
}

/**
 * One edit a person should make by hand, and where the fact behind it comes
 * from.
 *
 * `needs` is the whole design. `have_it` means the research already answered
 * it and the article did not use it, and the claims are quoted from the
 * dossier rather than written by the read. `not_established` means nothing in
 * the run answers it — those items say what is missing and never what it is.
 */
export interface PunchListItem {
  kind: 'add_sentence' | 'add_paragraph' | 'move' | 'rephrase' | 'cut'
  /** A heading from the article. Empty when the item is about the whole piece. */
  heading: string
  /** A few words quoted from the article, to find the spot. */
  where: string
  note: string
  needs: 'have_it' | 'not_established'
  have: { claim_id: string; text: string }[]
}

export interface PunchList {
  run_id: string
  items: PunchListItem[]
  /** Researched, graded, and never used. Found without a model. */
  researched_and_unused: { claim_id: string; text: string }[]
  /** What was thrown away and why — mostly items that reached for a figure. */
  dropped: string[]
}

/**
 * Where one passage of the finished article came from.
 *
 * A link means the passage and a chosen fact share a figure or a distinctive
 * phrase. It is not a check that the sentence means what the fact means, which
 * is why `status` exists and why every automatic link arrives as `provisional`.
 */
export interface ProvenanceLink {
  passage_id: string
  passage_hash: string
  source_kind: 'claim' | 'material'
  source_id: string
  basis: 'figure' | 'phrase'
  /** The figure or wording they share, so the operator sees why, not just that. */
  shared: string[]
  status: 'provisional' | 'confirmed'
  text: string
  as_of: string
  confidence: string
  operator_note: string
  caveats: string[]
}

export interface PassageProvenance {
  passage_id: string
  section_id: string
  heading: string
  text: string
  text_hash: string
  links: ProvenanceLink[]
  /** A figure in the prose that matches nothing on the desk. */
  unmatched_figures: string[]
}

export interface ProvenanceReport {
  run_id: string
  passages: PassageProvenance[]
  summary: Record<string, unknown> & { means: string }
}

/** One improvement an editor may ask for. A closed list, not a text box. */
export interface SectionEditAction {
  action_id: string
  label: string
}

/**
 * A change offered, not made.
 *
 * `could_not_do` is as much of an answer as `revised`. A request the evidence
 * cannot support must come back as a refusal with a reason, because the
 * failure mode of asking for a stronger recommendation is a model inventing
 * the thing that would make it stronger.
 */
/**
 * What a checker made of a candidate section, read against the frozen packet.
 *
 * Three answers, never two. `unchecked` is not a pass and is not a fail: a
 * checker that could not answer is a reason for a person to look, not a reason
 * to call the prose verified.
 */
export interface SectionEditReview {
  status: 'supported' | 'unsupported' | 'unchecked'
  checked: boolean
  assessment: string
  unsupported_claims: { claim: string; reason: string; severity: string }[]
}

/**
 * What changed factually, in two halves that must not be confused.
 *
 * `text_changes` are exact differences between the two strings — a figure that
 * appeared, a date that fell out, a caveat that is gone. They are not a
 * judgement: a regex noticing "only" is missing has reasoned about nothing.
 *
 * `review` is the reading. It is the only half that can say two prices were
 * swapped, because every figure is present in both and no comparison of sets
 * will see it.
 */
export interface FactualChanges {
  text_changes: { kind: string; text: string; note: string }[]
  text_changes_are: string
  review: SectionEditReview | null
  review_status: string
  candidate_hash: string
  base_revision: number
}

export interface SectionEditProposal {
  run_id: string
  /** This proposal, once. A repeated apply of it is the same edit, not a second one. */
  edit_id: string
  /** Which version of the whole article this was read from. */
  base_revision: number
  section_id: string
  heading: string
  action_id: string
  text_hash: string
  original: string
  revised: string
  what_changed: string
  could_not_do: string
  /** Figures in the revision that are in neither the original nor the packet. */
  introduced_figures: string[]
  /** What the checker made of it. Null on a refusal, which has nothing to judge. */
  review: SectionEditReview | null
  /** Absent on a refusal or a no-op, where nothing changed to explain. */
  factual_changes?: FactualChanges
}

/** The finished article. Its own call: the state is polled, this is not. */
export interface IntakeArticle {
  run_id: string
  title: string
  /** The editorial shape, in the words staging labels drafts with. */
  form_label: string
  markdown: string
  pipeline_status: string | null
  readiness_blockers: string[]
  constraint_checks: Record<string, unknown>
  word_count: number | null
}

export type IntakeStep =
  | 'seed'
  | 'grill'
  | 'brief'
  | 'prompt'
  | 'draft'
  | 'work_order'
  | 'research'

export interface IntakeState {
  run_id: string
  step: IntakeStep
  grill: IntakeGrill | null
  brief: IntakeBrief | null
  /** Null until Generate prompt is pressed, and again if the brief changes. */
  writer_prompt: IntakeWriterPrompt | null
  /** The ADR 0036 writer. Null on every run that never used it. */
  generation: IntakeGeneration | null
  /** The detector. Null until somebody asks for a read; it costs money. */
  review: IntakeReview | null
  work_order: IntakeWorkOrder | null
  research: IntakeResearch | null
  /** Present only on the response to a cut: what that decision costs. */
  cut_warnings?: string[]
  research_progress: IntakeResearchProgress | null
  writing: IntakeWriting | null
}


/**
 * One run, as it appears in the list of runs to go back to.
 *
 * A run is created when the seed is typed (ADR 0031), so one that never
 * reached an article is an ordinary run and appears here beside the ones that
 * did.
 */
export interface IntakeRunSummary {
  run_id: string
  /** The line that started it. What makes a run recognisable in a list. */
  seed: string
  status: string
  stage: string
  /** The stage in words, intake stages included. */
  stage_label: string
  updated_at: string
}

/** One fact on the shortlist, and where the line leaves it (#534). */
export interface SelectableClaim {
  claim_id: string
  text: string
  /** 1 is the fact the article most needs. */
  rank: number
  selected: boolean
  /** True when this fact is kept despite sitting below the line. */
  rescued: boolean
  /** True when it is cut despite sitting above it. */
  dropped: boolean
  /** One line from the ranker on what the article uses this for. */
  why: string
  questions: string[]
  /** Facts that said the same thing and stood down in favour of this one. */
  merged_in: string[]
  /**
   * A detail whose only job is colour. Ranked on how much of the place it
   * carries rather than on what it proves, and holding one of the reserved
   * slots — so cutting it costs the piece something a price band cannot
   * replace.
   */
  texture?: boolean
  /**
   * What this fact is for in the finished piece: the backbone of the argument,
   * something the reader acts on, or the detail that makes a place real.
   * Empty on a fact the ranking pass did not label, and on every selection
   * made before roles existed. The picker shows one plain list rather than a
   * heading that repeats the one above it.
   */
  role?: '' | 'backbone' | 'practical' | 'texture'
  confidence: string
}

export interface EvidenceHealthFinding {
  kind:
    | 'undated_time_sensitive'
    | 'no_source_to_return_to'
    | 'unsettled_conflict'
    | 'currency_promise_unmet'
  subject_ids: string[]
  detail: string
  /** The article promised something its evidence cannot support. */
  blocks_currency_promise: boolean
}

export interface EvidenceHealth {
  promises_currency: boolean
  /** The most recent date on a price or a time, when the piece promised now. */
  checked_against: string
  unmet_promise: boolean
  findings: EvidenceHealthFinding[]
  /** Says what a date is and is not evidence of. Rendered, never dropped. */
  means: string
}

export interface SelectionReview {
  /**
   * False on a run that never selected. That used to mean the article would be
   * written from every fact research found; it now means writing refuses,
   * because a selection that fell over and a person keeping everything looked
   * identical and only one of them should produce a hundred-fact article.
   */
  available: boolean
  claims: SelectableClaim[]
  keep_count: number
  target_word_count?: number
  deduped?: boolean
  ranked?: boolean
  /** Says which pass fell over, when one did. Empty on a clean selection. */
  note: string
  /**
   * Why this choice no longer describes what it was made from — the research
   * changed, or the brief did. Empty when it still holds. The same sentence
   * the hand-off would refuse with, shown while it can still be acted on.
   */
  stale_reason?: string
  /**
   * What is weak about the facts actually going to the writer — a price with
   * no date on it, a fact nobody can go back and re-check, two chosen
   * statements that disagree, or a promise of currency the evidence is too old
   * to keep.
   *
   * Advisory, always. A date says how much the article is entitled to claim,
   * never whether a fact is true, and the operator is the one who decides
   * whether eighteen months matters for this piece.
   */
  evidence_health?: EvidenceHealth
}

