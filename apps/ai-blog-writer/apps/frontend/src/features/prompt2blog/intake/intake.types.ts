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
}

/** A question and what was actually typed, kept word for word. */
export interface IntakeTurn {
  question_id: string
  topic: string
  ask: string
  recommendation: string
  pushback: string
  answer: string
}

export interface IntakeGrill {
  status: 'asking' | 'agreed' | ''
  seed: string
  turns: IntakeTurn[]
  pending: IntakeQuestion | null
  /** The played-back summary. Agreeing with it is the stop condition. */
  consensus: string
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

export type IntakeStep = 'seed' | 'grill' | 'brief' | 'work_order'

export interface IntakeState {
  run_id: string
  step: IntakeStep
  grill: IntakeGrill | null
  brief: IntakeBrief | null
  work_order: IntakeWorkOrder | null
  /** Present only on the response to a cut: what that decision costs. */
  cut_warnings?: string[]
}
