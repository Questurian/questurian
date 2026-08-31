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
  kind: 'load_bearing' | 'texture'
}

export interface IntakeWorkOrder {
  work_order_fingerprint: string
  brief_fingerprint: string
  primary_subject: string
  requirements: IntakeRequirement[]
  load_bearing_count: number
  texture_count: number
  cut_warnings: string[]
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

export interface IntakeResearch {
  work_order_fingerprint: string
  source_count: number
  claim_count: number
  requirement_status: Record<string, string>
  conflicts: string[]
  coverage: IntakeCoverage
}

/** What the ten searches are doing, while they do it. */
export interface IntakeResearchProgress {
  phase: 'gathering' | 'structuring'
  done: number
  total: number
  current_question: string
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
}

/** The finished article. Its own call: the state is polled, this is not. */
export interface IntakeArticle {
  run_id: string
  title: string
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
