import type { DayShellId, DayShellSlot, DayShellTemplate } from '../../types'

export const DEFAULT_DAY_SHELL_ID: DayShellId = 'full_day_balanced'

export const BUILT_IN_DAY_SHELLS: ReadonlyArray<DayShellTemplate> = [
  {
    id: 'full_day_balanced',
    name: 'Full Day Balanced',
    description: 'Classic full day with two morning anchors, lunch, afternoon, dinner, and nightlife.',
    slots: [
      { id: 'morning_activity', label: 'Morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['landmark', 'museum', 'culture', 'walk', 'morning'] },
      { id: 'morning_walk', label: 'Morning walk', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['walk', 'neighborhood', 'park', 'waterfront', 'cultural walk', 'morning'] },
      { id: 'local_tasting_lunch', label: 'Local tasting lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'restaurant', 'local food', 'regional specialty', 'tasting'] },
      { id: 'cultural_stop', label: 'Cultural stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['afternoon', 'museum', 'gallery', 'history', 'culture'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'evening meal', 'atmosphere'] },
      { id: 'drinks_social', label: 'Drinks & social', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['drinks', 'cocktails', 'wine bar', 'social', 'music', 'bar'] },
    ],
  },
  {
    id: 'light_full_day',
    name: 'Light Full Day',
    description: 'Complete but lower-friction day with a late start, lunch, relaxed activity, dinner, and low-key evening.',
    slots: [
      { id: 'morning_coffee', label: 'Morning coffee', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'bakery', 'pastry', 'late morning', 'easy'] },
      { id: 'scenic_lunch', label: 'Scenic or special lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'view', 'special setting', 'terrace', 'waterfront'] },
      { id: 'break_refreshment', label: 'Break or refreshment', daypart: 'afternoon', acceptableCollections: ['dining', 'attractions'], preferredCollections: ['dining'], intentTags: ['break', 'refreshment', 'snack', 'coffee', 'tea', 'rest'], avoidTags: ['strenuous', 'all day'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'comfortable'] },
      { id: 'low_key_evening', label: 'Low-key evening', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['low key', 'cocktails', 'lounge', 'wine bar', 'evening'], avoidTags: ['high energy', 'club'] },
    ],
  },
  {
    id: 'food_focused_full_day',
    name: 'Food-Focused Full Day',
    description: 'Full day built around coffee, markets, lunch, tastings, dinner, and dessert or drinks.',
    slots: [
      { id: 'morning_coffee', label: 'Morning coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['breakfast', 'coffee', 'cafe', 'bakery', 'pastry'] },
      { id: 'market_tasting', label: 'Market or tasting', daypart: 'morning', acceptableCollections: ['attractions', 'dining'], preferredCollections: ['attractions'], intentTags: ['market', 'food culture', 'local food', 'culinary', 'tasting'] },
      { id: 'local_tasting_lunch', label: 'Local tasting lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'restaurant', 'local specialty', 'regional food'] },
      { id: 'afternoon_food_stop', label: 'Afternoon food or tasting stop', daypart: 'afternoon', acceptableCollections: ['dining', 'attractions'], preferredCollections: ['dining'], intentTags: ['tasting', 'snack', 'market', 'coffee', 'cafe', 'food hall'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'fine dining', 'tasting menu'] },
      { id: 'dessert_drinks', label: 'Dessert or drinks', daypart: 'evening', acceptableCollections: ['dining', 'nightlife'], preferredCollections: ['dining'], intentTags: ['dessert', 'bakery', 'ice cream', 'gelato', 'pastry', 'coffee', 'cafe', 'cocktails', 'drinks'] },
    ],
  },
  {
    id: 'adventure_full_day',
    name: 'Adventure Full Day',
    description: 'Active day with two morning activities, lunch, two afternoon activities, and dinner.',
    slots: [
      { id: 'morning_walk', label: 'Morning walk', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'outdoor', 'hike', 'walk', 'active', 'morning'] },
      { id: 'second_morning_activity', label: 'Second morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'viewpoint', 'outdoor', 'active', 'experience'] },
      { id: 'lunch', label: 'Lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'casual', 'refuel', 'local food'] },
      { id: 'hands_on_experience', label: 'Hands-on experience', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['class', 'workshop', 'hands on', 'experience', 'activity', 'try something'] },
      { id: 'second_afternoon_activity', label: 'Second afternoon activity', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'view', 'active', 'experience', 'late afternoon'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'hearty', 'comfortable'] },
    ],
  },
  {
    id: 'nightlife_full_day',
    name: 'Nightlife Full Day',
    description: 'Late-start full day weighted toward dinner, social evening stops, and multiple nightlife venues.',
    slots: [
      { id: 'late_start_lunch', label: 'Lunch or late start', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'late start', 'brunch', 'restaurant'] },
      { id: 'recovery_friendly_activity', label: 'Recovery-friendly afternoon activity', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['relaxed', 'afternoon', 'gallery', 'walk', 'easy', 'culture'], avoidTags: ['strenuous', 'early morning'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'pre nightlife', 'social'] },
      { id: 'drinks_social', label: 'Drinks & social', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['cocktails', 'lounge', 'wine bar', 'social', 'evening'] },
      { id: 'entertainment', label: 'Entertainment', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['music', 'dancing', 'performance', 'show', 'club', 'high energy'] },
      { id: 'exclusive_evening', label: 'Exclusive evening', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['exclusive', 'premium', 'vip', 'reservation', 'special evening', 'late night'] },
    ],
  },
  {
    id: 'premium_indulgence_day',
    name: 'Premium Indulgence Day',
    description: 'High-end day with scenic lunch, exclusive dining, and a premium evening.',
    slots: [
      { id: 'morning_coffee', label: 'Morning coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'bakery', 'refined', 'local'] },
      { id: 'cultural_stop', label: 'Cultural stop', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['culture', 'gallery', 'design', 'museum', 'history'] },
      { id: 'scenic_lunch', label: 'Scenic or special lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'view', 'special setting', 'waterfront', 'terrace'] },
      { id: 'break_refreshment', label: 'Break or refreshment', daypart: 'afternoon', acceptableCollections: ['dining', 'attractions'], preferredCollections: ['dining'], intentTags: ['refreshment', 'tea', 'wine', 'snack', 'rest', 'premium'] },
      { id: 'exclusive_dining', label: 'Exclusive dining', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['fine dining', 'exclusive', 'tasting menu', 'reservation', 'premium'] },
      { id: 'exclusive_evening', label: 'Exclusive evening', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['exclusive', 'premium', 'cocktails', 'rooftop', 'members club', 'special evening'] },
    ],
  },
  {
    id: 'culture_and_stroll_day',
    name: 'Culture & Stroll Day',
    description: 'Walkable cultural day with coffee, a local lunch, a pause, sunset stroll, and evening market or tasting.',
    slots: [
      { id: 'morning_coffee', label: 'Morning coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'bakery', 'local'] },
      { id: 'morning_walk', label: 'Morning walk', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['walk', 'neighborhood', 'architecture', 'waterfront', 'park'] },
      { id: 'local_tasting_lunch', label: 'Local tasting lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['local food', 'regional specialty', 'tasting', 'lunch'] },
      { id: 'cultural_stop', label: 'Cultural stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['museum', 'gallery', 'history', 'art', 'culture'] },
      { id: 'evening_stroll', label: 'Evening stroll', daypart: 'evening', acceptableCollections: ['attractions', 'nightlife'], preferredCollections: ['attractions'], intentTags: ['sunset', 'evening walk', 'stroll', 'night view', 'promenade'] },
      { id: 'night_market_tasting', label: 'Night market or tasting', daypart: 'nightlife', acceptableCollections: ['dining', 'nightlife', 'attractions'], preferredCollections: ['dining'], intentTags: ['night market', 'tasting', 'street food', 'food hall', 'evening'] },
    ],
  },
] as const

export const DAY_SHELL_SLOT_PRESETS: ReadonlyArray<DayShellSlot> = [
  { id: 'morning_coffee', label: 'Morning coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'bakery', 'pastry', 'local'] },
  { id: 'morning_walk', label: 'Morning walk', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['walk', 'neighborhood', 'park', 'waterfront', 'culture'] },
  { id: 'local_tasting_lunch', label: 'Local tasting lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['local flavors', 'regional specialty', 'tasting', 'lunch'] },
  { id: 'scenic_lunch', label: 'Scenic or special lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['view', 'special setting', 'terrace', 'waterfront', 'lunch'] },
  { id: 'exclusive_dining', label: 'Exclusive dining', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['fine dining', 'exclusive', 'tasting menu', 'reservation', 'premium'] },
  { id: 'cultural_stop', label: 'Cultural stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['culture', 'art', 'history', 'museum', 'gallery'] },
  { id: 'break_refreshment', label: 'Break or refreshment', daypart: 'afternoon', acceptableCollections: ['dining', 'attractions'], preferredCollections: ['dining'], intentTags: ['drink', 'snack', 'rest', 'coffee', 'refreshment'] },
  { id: 'hands_on_experience', label: 'Hands-on experience', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['class', 'workshop', 'hands on', 'activity', 'experience'] },
  { id: 'drinks_social', label: 'Drinks & social', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['drinks', 'cocktails', 'wine bar', 'social', 'lounge'] },
  { id: 'entertainment', label: 'Entertainment', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['music', 'dancing', 'performance', 'show', 'club'] },
  { id: 'evening_stroll', label: 'Evening stroll', daypart: 'evening', acceptableCollections: ['attractions', 'nightlife'], preferredCollections: ['attractions'], intentTags: ['sunset', 'evening walk', 'stroll', 'night view'] },
  { id: 'night_market_tasting', label: 'Night market or tasting', daypart: 'nightlife', acceptableCollections: ['dining', 'nightlife', 'attractions'], preferredCollections: ['dining'], intentTags: ['night market', 'tasting', 'street food', 'food hall'] },
  { id: 'exclusive_evening', label: 'Exclusive evening', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['exclusive', 'premium', 'vip', 'reservation', 'special evening'] },
] as const

export function getAvailableDayShells(customShells?: DayShellTemplate[]): DayShellTemplate[] {
  const seen = new Set(BUILT_IN_DAY_SHELLS.map((shell) => shell.id))
  const custom = (customShells ?? []).filter((shell) => shell.id && !seen.has(shell.id) && shell.slots.length > 0)
  return [...BUILT_IN_DAY_SHELLS, ...custom]
}

export function getDayShellTemplate(shellId: DayShellId | undefined, customShells?: DayShellTemplate[]): DayShellTemplate {
  return getAvailableDayShells(customShells).find((shell) => shell.id === shellId) ?? BUILT_IN_DAY_SHELLS[0]
}
