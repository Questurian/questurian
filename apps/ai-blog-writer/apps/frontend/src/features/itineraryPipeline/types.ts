/**
 * The itinerary setup draft — the whole contract this screen edits.
 *
 * Two rules shape everything below.
 *
 * **Identity is explicit.** Days and stops carry their own ids. Array position
 * and the words "Day 2" are presentation; they change when the operator
 * reorders or renames, and anything keyed off them silently attaches notes to
 * the wrong day. A template is *snapshotted* into a day when it is chosen, so
 * two days on Full Day Balanced never share editable stops and a later edit to
 * the library cannot rewrite a layout somebody already approved.
 *
 * **Status is derived, never stored.** There is no `isReady` or `isApproved`
 * flag to fall out of step with the thing it describes. Approval records the
 * *signature* of the trip and the layout it was given against; it counts as
 * current only while both signatures still match what is on screen. That makes
 * "saving an unchanged value" a no-op by construction rather than by care, and
 * it makes a stale approval impossible to fake.
 */

/** Coarse time-of-day label. Not a clock time and not a duration. */
export type Daypart =
  | 'morning'
  | 'late_morning'
  | 'lunch'
  | 'afternoon'
  | 'dinner'
  | 'evening'
  | 'nightlife'

/** The three underlying place types the research side knows about. */
export type PlaceCategory = 'dining' | 'attractions' | 'nightlife'

/**
 * What kind of stop this is.
 *
 * `place` and `experience` both end in a venue search and differ only in what
 * is being looked for. `free_time` searches for nothing. `travel` is a transfer
 * to be planned, not a place to be picked.
 */
export type StopKind = 'place' | 'experience' | 'free_time' | 'travel'

export type TransportMode =
  | 'unspecified'
  | 'walk'
  | 'public_transport'
  | 'taxi'
  | 'car'
  | 'train'
  | 'bus'
  | 'flight'

/**
 * One end of a travel stop.
 *
 * `base` and `getaway` are references, not copied text: the base city can still
 * be renamed and the getaway destination is allowed to stay undecided until the
 * day's Grill. Only `custom` carries wording, and that wording is the
 * operator's, never invented.
 */
export type TravelPoint =
  | { ref: 'base' }
  | { ref: 'getaway' }
  | { ref: 'custom'; text: string }

export interface TravelDetails {
  from: TravelPoint
  to: TravelPoint
  mode: TransportMode
}

/**
 * One stop on one day — an occurrence, not a library entry.
 *
 * `sourceSlotId` keeps provenance (which template or preset row it came from)
 * without making the copy answerable to it.
 */
export interface SlotSnapshot {
  id: string
  sourceSlotId?: string
  kind: StopKind
  label: string
  daypart: Daypart
  optional: boolean
  purpose: string
  allowedCategories: PlaceCategory[]
  preferredCategories: PlaceCategory[]
  cues: string[]
  exclusions: string[]
  travel?: TravelDetails
}

export type AvailableTimeId =
  | 'full_day'
  | 'morning_only'
  | 'afternoon_onward'
  | 'evening_only'
  | 'custom'

export interface AvailableTime {
  id: AvailableTimeId
  /** `HH:MM`, only meaningful when `id` is `custom`. */
  customStart: string
  customEnd: string
  /** Explicit, because no time range here is allowed to wrap past midnight by implication. */
  endsNextDay: boolean
}

export type TemplateOrigin = 'builtin' | 'custom'

export interface DayTemplate {
  id: string
  name: string
  origin: TemplateOrigin
  /** One sentence describing the rhythm. Shown under the selector. */
  rhythm: string
  /** Short arrow sequence, e.g. `anchor → roam → eat`. Built-ins only. */
  shape?: string
  slots: Array<Omit<SlotSnapshot, 'id'>>
}

export interface DayApproval {
  tripRevision: string
  layoutRevision: string
  approvedAt: string
}

export interface DayDraft {
  id: string
  /** Working title. A label for the day, never a second article title. */
  label: string
  sourceTemplateId: string
  sourceTemplateName: string
  sourceTemplateOrigin: TemplateOrigin
  availableTime: AvailableTime
  slots: SlotSnapshot[]
  /** Known constraints entered during setup ("lands at 11am"). */
  setupNotes: string
  /** Workspace notes. Future content input; never invalidates structural approval. */
  preparationNotes: string
  approval?: DayApproval
  /**
   * One-time "I meant this" acknowledgments, each stamped with the layout
   * signature it was given against so that changing the layout resets it.
   */
  acknowledgments: string[]
}

export type TripScope = 'city_only' | 'with_getaway'
export type TimingMode = 'evergreen' | 'specific_dates' | 'weekday_sequence'

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface TripTiming {
  mode: TimingMode
  /** `YYYY-MM-DD`, only when mode is `specific_dates`. End is derived from day count. */
  startDate: string
  /** Only when mode is `weekday_sequence`. */
  firstWeekday: Weekday | ''
}

export type BudgetStyle = 'unspecified' | 'budget' | 'mid_range' | 'premium' | 'mixed'
export type Pace = 'unspecified' | 'relaxed' | 'balanced' | 'full'
export type WalkingTolerance = 'unspecified' | 'short' | 'moderate' | 'long'
export type TransportPreference = 'walking' | 'public_transport' | 'taxi' | 'rental_car'

/**
 * Preferences that apply to every day. All optional — a blank field means
 * "unspecified", which is a real answer and not an incomplete one.
 */
export interface SharedPreferences {
  audience: string
  budgetStyle: BudgetStyle
  budgetNote: string
  pace: Pace
  transport: TransportPreference[]
  transportNote: string
  walkingTolerance: WalkingTolerance
  dietaryNeeds: string
  accessNeeds: string
  mustInclude: string
  avoid: string
}

export interface GetawayPlan {
  /** May stay blank: the destination is allowed to be decided later. */
  destination: string
  /** 1-based day numbers within the trip. */
  departureDay: number | null
  returnDay: number | null
}

export interface TripDraft {
  titleSeed: string
  /**
   * Raw text, not a number. An empty box and a zero are different mistakes and
   * deserve different messages, and coercing early loses that.
   */
  dayCountInput: string
  baseCity: string
  scope: TripScope
  timing: TripTiming
  preferredAreas: string[]
  startingBase: string
  sharedPreferences: SharedPreferences
  getaway: GetawayPlan
}

export type Stage = 'trip' | 'days' | 'review' | 'workspace'

export interface ItinerarySetupDraft {
  schemaVersion: number
  draftId: string
  updatedAt: string
  /**
   * Where the backend copy of this trip lives, once there is one.
   *
   * Absent until the first day Grill is started. From that moment the backend
   * is canonical for the work — the interviews, directions, prompts and saved
   * days — and this is a *pointer*, not a second authoritative copy. The
   * setup itself is still edited here and pushed across on every change.
   *
   * Optional rather than a schema bump on purpose: a draft written before this
   * existed reads perfectly well without it, and resetting somebody's saved
   * trip to introduce a pointer would be a worse outcome than not having one.
   */
  workspaceId?: string
  trip: TripDraft
  days: DayDraft[]
  ui: {
    stage: Stage
    activeDayId: string | null
    /** Stop currently expanded for editing, so a reload lands where you left. */
    expandedSlotId: string | null
  }
}

/** The current on-disk shape. Bump when the draft stops being readable as-is. */
export const DRAFT_SCHEMA_VERSION = 1
