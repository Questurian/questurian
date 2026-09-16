/**
 * The day workflow, as the server describes it.
 *
 * These mirror `apps/backend/app/features/itinerary_pipeline/contracts.py`.
 * The server sends the whole day on every move rather than a delta, so this
 * screen is a view of where the day stands and never accumulates its own copy
 * of the truth — which is what keeps two tabs from disagreeing about a day
 * only one of them changed.
 */

/** The one word the screen leads with. Derived on the server, never stored. */
export type DayState =
  | 'layout_needs_review'
  | 'ready_to_start'
  | 'grill_asking'
  | 'agreed'
  | 'direction_review'
  | 'direction_accepted'
  | 'prompt_ready'
  | 'context_changed'
  | 'saved_needs_work'
  | 'saved_complete'

export interface GrillTurnView {
  question_id: string
  ask: string
  pushback: string
  answer: string
  accepted_as_drafted: boolean
}

export interface GrillPendingView {
  question_id: string
  ask: string
  recommendation: string
  pushback: string
}

export interface GrillView {
  run_id: string
  seed: string
  status: 'asking' | 'agreed'
  consensus: string
  markers_covered: string[]
  markers_missing: string[]
  turns: GrillTurnView[]
  pending: GrillPendingView | null
}

export interface SlotDirection {
  slot_id: string
  role: string
  must_have: string[]
  nice_to_have: string[]
  exclusions: string[]
}

export interface AgreementTurn {
  decision: string
  recommendation: string
  answer: string
  /** An accepted suggestion is a decision, not first-hand knowledge. */
  answer_origin: 'operator' | 'accepted_recommendation'
}

export interface DayDirection {
  contract_version: string
  day_id: string
  promise: string
  trip_role: string
  anchors: string[]
  geography: {
    required_area: string
    starting_point: string
    progression: string
    transfer_tolerance: string
    avoid_today: string[]
  }
  rhythm: {
    effort: string
    meal_balance: string
    rest_policy: string
    rest_minutes_minimum: number | null
    optionality: string
  }
  constraints: string[]
  slot_directions: SlotDirection[]
  continuity: {
    covered_elsewhere: string[]
    reserved_for_later: string[]
    deliberate_overlaps: string[]
  }
  change_policy: {
    must_remain: string
    may_be_proposed: string
    optional_slots_may_be_omitted: boolean
  }
  fails_if: string[]
  research_checklist: string[]
  agreement_trace: AgreementTurn[]
}

export interface DirectionRevision {
  revision: number
  status: 'candidate' | 'accepted'
  direction: DayDirection
  context_key: string
  created_at: string
  accepted_at: string
}

/** Characters, never tokens: what each part of the research call weighs. */
export interface PromptSize {
  sections: {
    system: number
    instructions: number
    brief: number
    writing: number
    schema: number
  }
  /** System prompt + in-app prompt + schema: what the call is handed. */
  total: number
  budget: number
  over_budget: boolean
  largest_section: 'system' | 'instructions' | 'brief' | 'writing' | 'schema'
  /** The copyable version, which adds the identity and the schema once. */
  copy_characters: number
}

/** The research allowance the prompt states. Guidance, not enforced. */
export interface ResearchBudget {
  venues: number
  searches: number
  fetches: number
}

export interface ExportView {
  export_id: string
  created_at: string
  direction_revision: number
  input_hash: string
  voice_version: string
  /** The copyable prompt: identity, assignment and schema, once each. */
  prompt_text: string
  /** True when the day has changed since this prompt was copied. */
  stale: boolean
  characters: number
  wire_version: string
  /** Built in the compact format. */
  compact: boolean
  /** Built in the original, larger format. Still copyable and importable. */
  legacy: boolean
  /** Whether the app will run research on it. A legacy prompt needs a rebuild. */
  runnable: boolean
  /** Readable pieces of the compact prompt. Empty on a legacy export. */
  sections: {
    instructions?: string
    brief?: string
    writing?: string
    schema?: string
  }
  size: PromptSize | Record<string, never>
  budget: ResearchBudget | Record<string, never>
}

export type StopStatus = 'selected' | 'unresolved' | 'omitted_optional'

export interface ResultStop {
  slotId: string
  status: StopStatus
  name: string | null
  category: string | null
  addressOrMeetingPoint: string | null
  area: string | null
  mapsUrl: string | null
  /** Minutes after midnight on the day itself. Over 1440 means the next day. */
  startMinutes: number | null
  durationMinutes: number | null
  whyHere: string
  readerCopy: string
  whatToDo: string[]
  practicalNotes: string[]
  claimIds: string[]
  selectionReason: string
  unresolvedReason: string | null
}

export interface ResultTransfer {
  from: string
  to: string
  mode: string
  minutesMin: number | null
  minutesMax: number | null
  basis: 'sourced' | 'planning_estimate' | 'unknown'
  sourceIds: string[]
  note: string
}

export interface ResultRestWindow {
  afterSlotId: string
  beforeSlotId: string
  minutes: number
  locationPolicy: 'stay_nearby' | 'named_location' | 'return_to_base' | 'unknown'
  description: string
}

export interface ResultSource {
  id: string
  url: string
  title: string
  publisher: string
  sourceType: 'official' | 'map' | 'secondary'
  accessedAt: string | null
  publishedOrUpdatedAt: string | null
}

export interface ResultClaim {
  id: string
  text: string
  sourceIds: string[]
  appliesTo: string
}

export interface ResultFeasibility {
  topic: string
  status: 'supported' | 'conditional' | 'unresolved' | 'not_applicable'
  detail: string
  sourceIds: string[]
}

export interface DayResult {
  contractVersion: string
  workspaceId: string
  dayId: string
  exportId: string
  inputHash: string
  /** Empty when the answer arrived as this object; the compact version when
   *  the app built this object from a smaller answer. */
  wireVersion?: string
  research: {
    performedAt: string | null
    browsingUsed: boolean
    /** Where browsingUsed came from: the model's own claim, the run's tool
     *  calls, or nothing at all. */
    browsingBasis?: 'model' | 'tool_calls' | 'unknown'
    limitations: string[]
  }
  status: 'ready_for_editor_review' | 'needs_decision' | 'insufficient_evidence'
  title: string
  dayIntro: string
  tripRole: string
  scheduleLabel: string
  stops: ResultStop[]
  transfers: ResultTransfer[]
  restWindows: ResultRestWindow[]
  sources: ResultSource[]
  claims: ResultClaim[]
  feasibility: ResultFeasibility[]
  proposedChanges: Array<{ slotId: string; proposal: string; reason: string }>
  tripMemory: {
    usedPlaces: string[]
    coveredExperiences: string[]
    reservedForLater: string[]
    nextDayImplications: string[]
  }
  editorNotes: string[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  layer:
    | 'transport'
    | 'schema'
    | 'identity'
    | 'structure'
    | 'evidence'
    | 'schedule'
    | 'review'
  path: string
  message: string
}

export interface CompletenessReport {
  selected: number
  unresolved: number
  omitted_optional: number
  required_unresolved: string[]
  missing_timing: string[]
  /** Questions the model itself left unresolved. The one reason a day is
   *  incomplete that does not point at a stop you can see. */
  outstanding_checks: string[]
  /** Consecutive stops with no journey, or one with no known time. */
  missing_legs?: string[]
  /** Stretches where a finish plus the journey (and rest) runs past the next start. */
  schedule_conflicts?: string[]
  complete: boolean
}

export interface ValidationReport {
  valid: boolean
  issues: ValidationIssue[]
  normalizations: string[]
  completeness: CompletenessReport
}

export interface SavedResultView {
  result_revision: number
  saved_at: string
  export_id: string
  result: DayResult
  report: ValidationReport
  /** The text that actually arrived, when the saved object was built from a
   *  compact answer. Empty otherwise. */
  returned_raw?: string
}

export interface DaySlotView {
  id: string
  label: string
  kind: 'place' | 'experience' | 'free_time' | 'travel'
  daypart: string
  optional: boolean
  categories: string[]
  purpose: string
}

/** The last in-app research run for a day. */
export interface ResearchView {
  state: 'running' | 'done' | 'failed'
  /** Dispatched and never heard from again — usually the server restarting
   *  mid-call. Distinct from failed: the app knows the call went out and does
   *  not know whether the provider answered or billed. */
  stalled: boolean
  detail: string
  /** The transport's own classification: quota_exhausted, not_connected,
   *  provider_unavailable, invalid_response. Different next steps. */
  fault: string
  model: string
  cost_usd: number | null
  /** How many provider round trips it took. One means it never searched,
   *  whatever the answer claims about itself. */
  turns: number | null
  started_at: string
  finished_at: string
  wire_version?: string
  duration_ms?: number | null
  /** Read off the run's own transcript. Null means unknown, never zero. */
  searches?: number | null
  fetches?: number | null
  budget?: ResearchBudget | Record<string, never>
  sent_characters?: number | null
  returned_characters?: number | null
  output_tokens?: number | null
  /** The saved result this run's answer became, once it was saved. */
  saved_as_revision?: number | null
  /** False when the day has moved on since this run was made. */
  for_current_export: boolean
  /** The returned JSON, only when it answers the prompt this day is on. */
  raw: string
}

export interface DayWorkView {
  workspace_id: string
  workspace_revision: number
  day_id: string
  day_number: number
  day_label: string
  day_date: string
  window: string
  slots: DaySlotView[]
  layout_approved: boolean
  context_key: string
  state: DayState
  grill: GrillView | null
  grill_context_changed: boolean
  candidate_direction: DirectionRevision | null
  accepted_direction: DirectionRevision | null
  export: ExportView | null
  result: SavedResultView | null
  result_history: Array<{
    result_revision: number
    saved_at: string
    title: string
    complete: boolean
  }>
  review: { notes: string; evidence_reviewed: boolean }
  research: ResearchView | null
  /** A call this day dispatched and never heard the end of. */
  pending_attempt: { attempt_key: string; kind: string; started_at: string } | null
  /** Only on an apply response: false means the save was a duplicate. */
  created?: boolean
}

export interface WorkspaceView {
  workspace_id: string
  revision: number
  setup_hash: string
  days: Array<{
    day_id: string
    day_number: number
    day_label: string
    state: DayState
    title: string | null
    complete: boolean
  }>
}

export interface ImportPreview {
  valid: boolean
  report: ValidationReport
  result: DayResult | null
  content_hash: string
  export_id: string
  changes: string[]
  /** A deterministic follow-up prompt. Only present when the paste failed. */
  repair_prompt: string | null
  /** True when this is, unedited, what an in-app run returned. */
  from_research_run?: boolean
}
