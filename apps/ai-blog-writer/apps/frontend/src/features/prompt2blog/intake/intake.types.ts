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
  spine: string
  outcome: string
  fails_if: string
  must_name: string[]
  /** Shown back in full so you can see what the system thinks you said. */
  material: { kind: string; statement: string }[]
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

export type IntakeStep = 'seed' | 'grill' | 'brief' | 'work_order' | 'research'

export interface IntakeState {
  run_id: string
  step: IntakeStep
  grill: IntakeGrill | null
  brief: IntakeBrief | null
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
}

