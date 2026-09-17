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
  /** The accepted agreement is in the older, long format: write the short
   *  summary again from the same conversation. */
  | 'direction_outdated'
  | 'direction_accepted'
  | 'prompt_ready'
  | 'context_changed'
  /** A proposal is saved and something in it needs a decision. */
  | 'proposal_open'
  | 'proposal_ready'

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

export interface AgreementTurn {
  decision: string
  recommendation: string
  answer: string
  /** An accepted suggestion is a decision, not first-hand knowledge. */
  answer_origin: 'operator' | 'accepted_recommendation'
}

export interface SlotSummary {
  slot_id: string
  role: string
  requirements: string[]
  preferences: string[]
}

/** What the interview agreed, said short. */
export interface DaySummary {
  contract_version: 'itinerary-day-summary-v1'
  day_id: string
  angle: string
  trip_fit: string
  area: string
  /** The operator's own musts. */
  requirements: string[]
  /** Everything the selection may adjust. */
  preferences: string[]
  avoid: string[]
  slots: SlotSummary[]
  agreement_trace: AgreementTurn[]
}

/** The older, long agreement. Only read, never built from. */
export interface OlderDirection {
  contract_version: 'itinerary-day-direction-v1'
  day_id: string
  promise: string
  trip_role: string
  agreement_trace: AgreementTurn[]
  [key: string]: unknown
}

export interface DirectionRevision {
  revision: number
  status: 'candidate' | 'accepted'
  direction: DaySummary | OlderDirection
  context_key: string
  created_at: string
  accepted_at: string
}

/** Characters, never tokens: what each part of the call weighs. */
export interface PromptSize {
  sections: Record<string, number>
  /** System prompt + in-app prompt + schema: what the call is handed. */
  total: number
  /** A number to measure against; nothing is cut to meet it. */
  target: number
  over_target: boolean
  largest_section: string
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
  /** The copyable prompt: identity, assignment and schema, once each. */
  prompt_text: string
  /** True when the day has changed since this prompt was built. */
  stale: boolean
  /** What changed, in words, when stale. */
  changes: string[]
  characters: number
  sections: Record<string, string>
  size: PromptSize | Record<string, never>
  budget: ResearchBudget | Record<string, never>
  /** Set when this prompt asks for a changed version of a saved proposal. */
  revision: { base_revision: number; change: string; slot_id: string } | null
}

export type PickStatus = 'selected' | 'unresolved' | 'omitted_optional'

export interface SelectionSource {
  url: string
  title: string
}

export interface SelectionPick {
  slotId: string
  status: PickStatus
  name: string | null
  category: string | null
  area: string | null
  address: string | null
  /** One sentence. For an open stop: why it is open. */
  reason: string
  note: string
  sources: SelectionSource[]
  /** A map search the app built. Never taken from an answer. */
  mapsUrl: string | null
  chosenBy: 'ai' | 'editor'
}

export interface SelectionStay {
  stayId: string
  name: string
  area: string
  reason: string
  sources: SelectionSource[]
  mapsUrl: string | null
}

export interface SelectionJourney {
  from: string
  to: string
  mode: string
  /** An estimate. Null when unknown or when a swap moved one end. */
  minutes: number | null
  note: string
}

export interface SelectionQuestion {
  slotId: string | null
  question: string
  options: string[]
}

export interface DaySelection {
  contractVersion: string
  workspaceId: string
  dayId: string
  exportId: string
  inputHash: string
  overview: string
  tripFit: string
  stay: SelectionStay | null
  picks: SelectionPick[]
  journeys: SelectionJourney[]
  questions: SelectionQuestion[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  layer: string
  path: string
  message: string
}

export interface CompletenessReport {
  selected: number
  unresolved: number
  omitted_optional: number
  required_unresolved: string[]
  /** The proposal's open questions. */
  outstanding_checks: string[]
  complete: boolean
}

export interface ValidationReport {
  valid: boolean
  issues: ValidationIssue[]
  normalizations: string[]
  completeness: CompletenessReport
}

export interface ProposalView {
  revision: number
  saved_at: string
  origin: 'answer' | 'editor_swap'
  export_id: string
  selection: DaySelection
  report: ValidationReport
  /** Something this day depends on changed since the proposal was made. */
  stale: boolean
  changes: string[]
}

/** A day saved in the older article format, reduced to what is worth rereading. */
export interface PreviousVersionView {
  revision: number
  saved_at: string
  title: string
  intro: string
  stops: Array<{ slot_id: string; status: string; name: string | null; copy: string }>
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

/** One end of a day, as the server resolved it. */
export interface StayEndView {
  id: string
  mode: 'location_manager' | 'recommend'
  name: string
  area: string
  note: string
  nights: [number, number]
  /** False for a recommendation nobody has chosen yet. */
  resolved: boolean
}

export interface DayStayView {
  start: StayEndView | null
  end: StayEndView | null
  final_day: boolean
}

/** The last in-app run for a day. */
export interface ResearchView {
  state: 'running' | 'done' | 'failed'
  /** Dispatched and never heard from again. Distinct from failed: the app
   *  does not know whether the provider answered or billed. */
  stalled: boolean
  detail: string
  fault: string
  model: string
  cost_usd: number | null
  turns: number | null
  started_at: string
  finished_at: string
  duration_ms?: number | null
  /** Read off the run's own transcript. Null means unknown, never zero. */
  searches?: number | null
  fetches?: number | null
  sent_characters?: number | null
  saved_as_revision?: number | null
  /** False when the day has moved on since this run was made. */
  for_current_export: boolean
  /** The returned JSON, only when it answers the prompt this day is on. */
  raw: string
}

export interface HistoryRow {
  revision: number
  saved_at: string
  kind: 'proposal' | 'previous'
  origin: 'answer' | 'editor_swap'
  headline: string
  complete: boolean
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
  stay: DayStayView
  export: ExportView | null
  proposal: ProposalView | null
  previous_version: PreviousVersionView | null
  history: HistoryRow[]
  research: ResearchView | null
  /** A call this day dispatched and never heard the end of. */
  pending_attempt: { attempt_key: string; kind: string; started_at: string } | null
  /** Only on a save response: false means the save was a duplicate. */
  created?: boolean
}

export interface WorkspaceDayView {
  day_id: string
  day_number: number
  day_label: string
  state: DayState
  complete: boolean
  overview: string
  trip_fit: string
  picks: Array<{ label: string; name: string | null; status: PickStatus }>
  stay: DayStayView
}

export interface WorkspaceView {
  workspace_id: string
  revision: number
  setup_hash: string
  days: WorkspaceDayView[]
}

export interface ImportPreview {
  valid: boolean
  report: ValidationReport
  selection: DaySelection | null
  content_hash: string
  export_id: string
  changes: string[]
  /** A deterministic follow-up prompt. Only present when the answer failed. */
  repair_prompt: string | null
  /** True when this is, unedited, what an in-app run returned. */
  from_research_run?: boolean
}

export interface HotelOption {
  id: number
  name: string
  area: string
  type: string
  /** A picture Location Manager serves; empty when it has none. */
  image: string
}

export interface HotelList {
  available: boolean
  error: string
  hotels: HotelOption[]
}

export function isSummary(direction: DaySummary | OlderDirection): direction is DaySummary {
  return direction.contract_version === 'itinerary-day-summary-v1'
}
