import type {
  DayTemplate,
  Daypart,
  PlaceCategory,
  SlotSnapshot,
  StopKind,
} from './types'

/**
 * The seven revised built-in day rhythms, plus the stop palette.
 *
 * These are **feature-scoped copies**, not the app's existing day-shell
 * constants. The revision changed what several templates are *for* — Light Full
 * Day now opens with coffee and buys a memorable low-effort visit, Culture &
 * Stroll puts its cultural anchor before lunch, Nightlife builds toward one
 * main venue instead of listing three — and the listicle builder still ships
 * the older rhythms to existing drafts. Editing the shared constants would have
 * rewritten those. So this file owns the new definitions and
 * `listicleItineraries` keeps the old ones, which is the whole reason the plan
 * asked for a scoped template module.
 *
 * `cues` are taken from each slot's own purpose sentence rather than from a
 * separate source. They describe the experience being looked for; they are not
 * a checklist of requirements, and each day's Grill is where must-have gets
 * separated from nice-to-have.
 */

type SlotSpec = Omit<SlotSnapshot, 'id'>

/** Terse constructor so the tables below read as tables. */
function slot(
  sourceSlotId: string,
  label: string,
  daypart: Daypart,
  allowed: PlaceCategory[],
  preferred: PlaceCategory[],
  purpose: string,
  options: {
    kind?: StopKind
    optional?: boolean
    cues?: string[]
    exclusions?: string[]
  } = {},
): SlotSpec {
  return {
    sourceSlotId,
    kind: options.kind ?? 'place',
    label,
    daypart,
    optional: options.optional ?? false,
    purpose,
    allowedCategories: allowed,
    preferredCategories: preferred,
    cues: options.cues ?? [],
    exclusions: options.exclusions ?? [],
  }
}

const DINING: PlaceCategory[] = ['dining']
const ATTRACTIONS: PlaceCategory[] = ['attractions']
const NIGHTLIFE: PlaceCategory[] = ['nightlife']

export const DEFAULT_TEMPLATE_ID = 'full_day_balanced'

export const BUILT_IN_TEMPLATES: DayTemplate[] = [
  {
    id: 'full_day_balanced',
    name: 'Full Day Balanced',
    origin: 'builtin',
    shape: 'anchor → roam → eat → anchor → eat → unwind',
    rhythm:
      'A landmark morning, a cultural afternoon and two meals, with an easy social finish.',
    slots: [
      slot('signature_activity', 'Signature activity', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Structure the morning around a memorable landmark or experience.',
        { cues: ['landmark', 'memorable', 'signature'] }),
      slot('neighborhood_exploration', 'Neighborhood exploration', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Wander streets, shops and local landmarks; complement the anchor.',
        { cues: ['streets', 'shops', 'local landmarks'] }),
      slot('lunch', 'Lunch', 'lunch', DINING, DINING,
        'Pause for a local meal.',
        { cues: ['local meal', 'lunch'] }),
      slot('cultural_activity', 'Cultural / experiential activity', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Give the afternoon a museum, cultural visit or participatory experience.',
        { kind: 'experience', cues: ['museum', 'cultural visit', 'participatory'] }),
      slot('dinner', 'Dinner', 'dinner', DINING, DINING,
        'Settle into an evening meal.',
        { cues: ['dinner', 'evening meal'] }),
      slot('social_evening', 'Social evening', 'evening', NIGHTLIFE, NIGHTLIFE,
        'Unwind with conversation, drinks or music.',
        { cues: ['conversation', 'drinks', 'music'] }),
    ],
  },
  {
    id: 'light_full_day',
    name: 'Light Full Day',
    origin: 'builtin',
    shape: 'ease in → memorable low-effort experience → eat → wander → eat → optional unwind',
    rhythm:
      'A complete day at low intensity — one memorable visit that asks nothing of your legs.',
    slots: [
      slot('coffee_light_breakfast', 'Coffee / light breakfast', 'morning', DINING, DINING,
        'Start gently with coffee, pastry or a light breakfast.',
        { cues: ['coffee', 'pastry', 'light breakfast'] }),
      slot('scenic_low_effort', 'Scenic / low-effort activity', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Make a memorable visit without demanding exertion; park, waterfront or accessible overlook.',
        { cues: ['park', 'waterfront', 'accessible overlook'], exclusions: ['strenuous', 'all-day commitment'] }),
      slot('special_lunch', 'Special lunch', 'lunch', DINING, DINING,
        'Make lunch a highlight through food or setting.',
        { cues: ['highlight', 'setting', 'lunch'] }),
      slot('leisure_exploration', 'Leisure / neighborhood exploration', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Explore at an unhurried pace; short walks, shops or gardens.',
        { cues: ['unhurried', 'short walks', 'shops', 'gardens'] }),
      slot('dinner', 'Dinner', 'dinner', DINING, DINING,
        'Choose a comfortable evening meal.',
        { cues: ['comfortable', 'evening meal'] }),
      slot('relaxed_evening', 'Relaxed evening', 'evening', NIGHTLIFE, NIGHTLIFE,
        'Offer a quiet lounge or social finish that can be skipped.',
        { optional: true, cues: ['quiet', 'lounge', 'social finish'], exclusions: ['high energy', 'club'] }),
    ],
  },
  {
    id: 'food_focused_full_day',
    name: 'Food-Focused Full Day',
    origin: 'builtin',
    shape: 'eat → explore food → eat big → breathe → taste → eat big → optional finish',
    rhythm:
      'Food from breakfast to dessert, with one deliberate non-food break so the day is survivable.',
    slots: [
      slot('breakfast_iconic_coffee', 'Breakfast / iconic coffee', 'morning', DINING, DINING,
        'Introduce local food culture through breakfast or a distinctive cafe.',
        { cues: ['local food culture', 'breakfast', 'distinctive cafe'] }),
      slot('market_food_exploration', 'Market / food exploration', 'morning', ['attractions', 'dining'], ATTRACTIONS,
        'Browse a market and learn about ingredients; avoid another full meal.',
        { kind: 'experience', cues: ['market', 'ingredients'], exclusions: ['full meal'] }),
      slot('signature_lunch', 'Signature lunch', 'lunch', DINING, DINING,
        'Anchor lunch around a regional specialty.',
        { cues: ['regional specialty'] }),
      slot('neighborhood_walk', 'Neighborhood walk / light activity', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Create a non-food breathing space between meals.',
        { cues: ['walk', 'breathing space'] }),
      slot('specialty_tasting', 'Specialty tasting / snack', 'afternoon', ['dining', 'attractions'], DINING,
        'Try one specialty in a small portion, not another full meal.',
        { cues: ['specialty', 'small portion', 'tasting'], exclusions: ['full meal'] }),
      slot('destination_dinner', 'Destination dinner', 'dinner', DINING, DINING,
        'Make dinner a deliberate culinary destination.',
        { cues: ['culinary destination', 'deliberate'] }),
      slot('dessert_drinks', 'Dessert / drinks', 'evening', ['dining', 'nightlife'], DINING,
        'Offer an optional small finish suited to appetite and energy.',
        { optional: true, cues: ['dessert', 'small finish', 'drinks'] }),
    ],
  },
  {
    id: 'adventure_full_day',
    name: 'Adventure Full Day',
    origin: 'builtin',
    shape: 'warm up → adventure anchor → refuel → immerse → recover → eat',
    rhythm:
      'One big adventure with a warm-up before it and a deliberate recovery after it.',
    slots: [
      slot('active_opener', 'Active opener', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Warm up with a walk, hike or outdoor activity.',
        { kind: 'experience', cues: ['walk', 'hike', 'outdoor'] }),
      slot('signature_adventure', 'Signature adventure', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Anchor the day in a distinctive adventure suited to traveler ability.',
        { kind: 'experience', cues: ['distinctive adventure', 'traveler ability'] }),
      slot('lunch', 'Lunch', 'lunch', DINING, DINING,
        'Refuel and pause between active experiences.',
        { cues: ['refuel', 'pause'] }),
      slot('hands_on_experience', 'Hands-on / immersive experience', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Participate in a class, guided experience or water activity.',
        { kind: 'experience', cues: ['class', 'guided experience', 'water activity'] }),
      slot('scenic_recovery', 'Scenic recovery activity', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Slow down at a waterfront, park or easy viewpoint; recovery is the purpose.',
        { cues: ['waterfront', 'park', 'easy viewpoint'], exclusions: ['strenuous', 'all-day commitment'] }),
      slot('dinner', 'Dinner', 'dinner', DINING, DINING,
        'Finish with a comfortable, restorative meal.',
        { cues: ['comfortable', 'restorative'] }),
    ],
  },
  {
    id: 'nightlife_full_day',
    name: 'Nightlife Full Day',
    origin: 'builtin',
    shape: 'late start → easy exploration → reset → dinner → social opener → show → main event',
    rhythm:
      'A late start that spends the day saving energy, then builds toward one main venue.',
    slots: [
      slot('late_lunch_brunch', 'Late lunch / brunch', 'lunch', DINING, DINING,
        'Begin late with a substantial meal.',
        { cues: ['late start', 'substantial meal', 'brunch'] }),
      slot('low_key_daytime', 'Low-key daytime activity', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Explore without using up energy for the night.',
        { cues: ['low key', 'easy'], exclusions: ['strenuous', 'all-day commitment'] }),
      slot('reset_stop', 'Reset / pre-evening stop', 'afternoon', ['dining', 'attractions'], DINING,
        'Pause at a cafe, quiet garden or refreshment stop before the evening.',
        { cues: ['cafe', 'quiet garden', 'refreshment'] }),
      slot('dinner', 'Dinner', 'dinner', DINING, DINING,
        'Provide a proper meal before nightlife.',
        { cues: ['proper meal', 'before nightlife'] }),
      slot('cocktail_opener', 'Cocktail / social opener', 'evening', ['dining', 'nightlife'], DINING,
        'Start socially with a cocktail bar or lounge before entertainment.',
        { cues: ['cocktail bar', 'lounge', 'social'] }),
      slot('entertainment', 'Entertainment', 'evening', NIGHTLIFE, NIGHTLIFE,
        'See comedy, live music or a performance; distinguish this from the final venue.',
        { cues: ['comedy', 'live music', 'performance'] }),
      slot('main_nightlife', 'Main nightlife destination', 'nightlife', NIGHTLIFE, NIGHTLIFE,
        'Build toward the main club, dance floor or late-night destination.',
        { cues: ['club', 'dance floor', 'late night'] }),
    ],
  },
  {
    id: 'premium_indulgence_day',
    name: 'Premium Indulgence Day',
    origin: 'builtin',
    shape: 'elevated start → signature experience → destination lunch → indulgent leisure → fine dining → premium finish',
    rhythm:
      'Indulgence treated as more than expensive meals — one leisure experience carries the afternoon.',
    slots: [
      slot('elevated_breakfast', 'Elevated breakfast / coffee', 'morning', DINING, DINING,
        'Begin with refined breakfast or exceptional coffee.',
        { cues: ['refined', 'exceptional coffee'] }),
      slot('signature_luxury_experience', 'Signature cultural / luxury experience', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Anchor the morning with distinctive culture, design or a private experience.',
        { kind: 'experience', cues: ['culture', 'design', 'private experience'] }),
      slot('destination_lunch', 'Destination lunch', 'lunch', DINING, DINING,
        'Choose lunch for its food and special setting.',
        { cues: ['special setting', 'destination'] }),
      slot('indulgent_leisure', 'Indulgent leisure experience', 'afternoon', ['attractions', 'dining', 'nightlife'], ATTRACTIONS,
        'Add spa, shopping, private tour, afternoon tea, beach club, wine tasting or lounge time; indulgence is more than expensive meals.',
        { kind: 'experience', cues: ['spa', 'private tour', 'afternoon tea', 'beach club', 'wine tasting'] }),
      slot('fine_dining', 'Fine dining', 'dinner', DINING, DINING,
        'Give dinner a considered fine-dining experience.',
        { cues: ['fine dining', 'considered'] }),
      slot('premium_evening', 'Premium evening experience', 'evening', NIGHTLIFE, NIGHTLIFE,
        'Finish with a distinctive performance, reservation-led lounge or special evening.',
        { cues: ['performance', 'reservation', 'special evening'] }),
    ],
  },
  {
    id: 'culture_and_stroll_day',
    name: 'Culture & Stroll Day',
    origin: 'builtin',
    shape: 'local start → explore → cultural anchor → lunch → artisan discovery → stroll → casual meal',
    rhythm:
      'The cultural anchor lands before lunch, and the afternoon discovers rather than repeats it.',
    slots: [
      slot('local_breakfast', 'Local breakfast / coffee', 'morning', DINING, DINING,
        'Start with local breakfast traditions or a neighborhood cafe.',
        { cues: ['local breakfast', 'neighborhood cafe'] }),
      slot('neighborhood_exploration', 'Neighborhood exploration', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Read the neighborhood through streets, architecture and shops.',
        { cues: ['streets', 'architecture', 'shops'] }),
      slot('cultural_anchor', 'Cultural anchor', 'morning', ATTRACTIONS, ATTRACTIONS,
        'Give the morning purpose with a museum, historical site or major cultural visit before lunch.',
        { cues: ['museum', 'historical site', 'major cultural visit'] }),
      slot('local_lunch', 'Local lunch', 'lunch', DINING, DINING,
        'Use a local meal as the natural break after the anchor.',
        { cues: ['local meal', 'break'] }),
      slot('artisan_stop', 'Secondary cultural / artisan stop', 'afternoon', ATTRACTIONS, ATTRACTIONS,
        'Choose a gallery, craft market, historic shop, bookstore or studio; avoid automatically adding another full museum.',
        { cues: ['gallery', 'craft market', 'historic shop', 'bookstore', 'studio'], exclusions: ['second full museum'] }),
      slot('evening_stroll', 'Evening stroll', 'evening', ATTRACTIONS, ATTRACTIONS,
        'Wind down through a scenic walk or neighborhood route.',
        { cues: ['scenic walk', 'neighborhood route'] }),
      slot('market_casual_dinner', 'Market / casual dinner', 'dinner', ['dining', 'attractions'], DINING,
        'Finish with market food or a relaxed local meal.',
        { cues: ['market food', 'relaxed', 'local'] }),
    ],
  },
]

/**
 * The stop palette offered by Add stop — a list of individual stops, not
 * another day sequence. Free time and Travel are appended by the editor because
 * they are structural rather than place-oriented.
 */
export const STOP_PRESETS: SlotSpec[] = [
  slot('morning_coffee', 'Morning coffee', 'morning', DINING, DINING,
    'Start the day with coffee or a local bakery.',
    { cues: ['coffee', 'cafe', 'bakery', 'pastry', 'local'] }),
  slot('morning_walk', 'Morning walk', 'morning', ATTRACTIONS, ATTRACTIONS,
    'Read the neighborhood on foot before the day fills up.',
    { cues: ['walk', 'neighborhood', 'park', 'waterfront', 'culture'] }),
  slot('local_tasting_lunch', 'Local tasting lunch', 'lunch', DINING, DINING,
    'Eat the regional specialty at lunch.',
    { cues: ['local flavors', 'regional specialty', 'tasting', 'lunch'] }),
  slot('scenic_lunch', 'Scenic or special lunch', 'lunch', DINING, DINING,
    'Choose lunch for its view or setting.',
    { cues: ['view', 'special setting', 'terrace', 'waterfront', 'lunch'] }),
  slot('exclusive_dining', 'Exclusive dining', 'dinner', DINING, DINING,
    'Make dinner the reservation the day is built around.',
    { cues: ['fine dining', 'exclusive', 'tasting menu', 'reservation', 'premium'] }),
  slot('cultural_stop', 'Cultural stop', 'afternoon', ATTRACTIONS, ATTRACTIONS,
    'Visit a museum, gallery or historic site.',
    { cues: ['culture', 'art', 'history', 'museum', 'gallery'] }),
  slot('break_refreshment', 'Break or refreshment', 'afternoon', ['dining', 'attractions'], DINING,
    'Sit down for a drink or snack between activities.',
    { cues: ['drink', 'snack', 'rest', 'coffee', 'refreshment'] }),
  slot('hands_on_experience', 'Hands-on experience', 'afternoon', ATTRACTIONS, ATTRACTIONS,
    'Take part in a class, workshop or guided activity.',
    { kind: 'experience', cues: ['class', 'workshop', 'hands on', 'activity', 'experience'] }),
  slot('drinks_social', 'Drinks & social', 'evening', NIGHTLIFE, NIGHTLIFE,
    'Open the evening socially over drinks.',
    { cues: ['drinks', 'cocktails', 'wine bar', 'social', 'lounge'] }),
  slot('entertainment', 'Entertainment', 'nightlife', NIGHTLIFE, NIGHTLIFE,
    'See music, a performance or a show.',
    { cues: ['music', 'dancing', 'performance', 'show', 'club'] }),
  slot('evening_stroll', 'Evening stroll', 'evening', ['attractions', 'nightlife'], ATTRACTIONS,
    'Walk the city at sunset or after dark.',
    { cues: ['sunset', 'evening walk', 'stroll', 'night view'] }),
  slot('night_market_tasting', 'Night market or tasting', 'nightlife', ['dining', 'nightlife', 'attractions'], DINING,
    'Eat late at a night market or food hall.',
    { cues: ['night market', 'tasting', 'street food', 'food hall'] }),
  slot('exclusive_evening', 'Exclusive evening', 'nightlife', NIGHTLIFE, NIGHTLIFE,
    'Finish somewhere reservation-led and special.',
    { cues: ['exclusive', 'premium', 'vip', 'reservation', 'special evening'] }),
]

/** A blank stop of each structural kind, for Add stop. */
export const FREE_TIME_PRESET: SlotSpec = {
  kind: 'free_time',
  label: 'Free time',
  daypart: 'afternoon',
  optional: false,
  purpose: 'Leave this stretch unplanned.',
  allowedCategories: [],
  preferredCategories: [],
  cues: [],
  exclusions: [],
}

export const TRAVEL_PRESET: SlotSpec = {
  kind: 'travel',
  label: 'Travel',
  daypart: 'morning',
  optional: false,
  purpose: 'Move between two places; the transfer itself needs planning.',
  allowedCategories: [],
  preferredCategories: [],
  cues: [],
  exclusions: [],
  travel: { from: { ref: 'base' }, to: { ref: 'getaway' }, mode: 'unspecified' },
}

export function findTemplate(
  templateId: string,
  customTemplates: DayTemplate[] = [],
): DayTemplate | undefined {
  return (
    BUILT_IN_TEMPLATES.find(template => template.id === templateId) ??
    customTemplates.find(template => template.id === templateId)
  )
}

export function defaultTemplate(): DayTemplate {
  return BUILT_IN_TEMPLATES.find(template => template.id === DEFAULT_TEMPLATE_ID) ?? BUILT_IN_TEMPLATES[0]
}

export const DAYPART_LABELS: Record<Daypart, string> = {
  morning: 'Morning',
  late_morning: 'Late morning',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  dinner: 'Dinner',
  evening: 'Evening',
  nightlife: 'Nightlife',
}

/** Canonical clock order, used to notice an unusual sequence — never to sort. */
export const DAYPART_ORDER: Daypart[] = [
  'morning',
  'late_morning',
  'lunch',
  'afternoon',
  'dinner',
  'evening',
  'nightlife',
]

export const STOP_KIND_LABELS: Record<StopKind, string> = {
  place: 'Place',
  experience: 'Experience',
  free_time: 'Free time',
  travel: 'Travel',
}

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  dining: 'Restaurant',
  attractions: 'Activity',
  nightlife: 'Nightlife',
}
