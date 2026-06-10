import type { DayShellId, DayShellTemplate } from '../../types'

export const DEFAULT_DAY_SHELL_ID: DayShellId = 'full_day_balanced'

export const BUILT_IN_DAY_SHELLS: ReadonlyArray<DayShellTemplate> = [
  {
    id: 'full_day_balanced',
    name: 'Full Day Balanced',
    description: 'Classic full day with two morning anchors, lunch, afternoon, dinner, and nightlife.',
    slots: [
      { id: 'morning_activity', label: 'Morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['landmark', 'museum', 'culture', 'walk', 'morning'] },
      { id: 'second_morning_activity', label: 'Second morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['landmark', 'neighborhood', 'gallery', 'market', 'morning'] },
      { id: 'lunch', label: 'Lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'restaurant', 'local food'] },
      { id: 'afternoon_activity', label: 'Afternoon activity', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['afternoon', 'museum', 'tour', 'experience', 'thing to do'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'evening meal'] },
      { id: 'nightlife', label: 'Nightlife', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['nightlife', 'cocktails', 'music', 'late night', 'bar', 'club'] },
    ],
  },
  {
    id: 'light_full_day',
    name: 'Light Full Day',
    description: 'Complete but lower-friction day with a late start, lunch, relaxed activity, dinner, and low-key evening.',
    slots: [
      { id: 'late_morning_activity', label: 'Late-morning activity', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['late morning', 'easy', 'walk', 'museum', 'low effort'] },
      { id: 'lunch', label: 'Lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'restaurant', 'easy'] },
      { id: 'relaxed_afternoon_activity', label: 'Relaxed afternoon activity', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['afternoon', 'relaxed', 'stroll', 'gallery', 'park'], avoidTags: ['strenuous', 'all day'] },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'restaurant', 'comfortable'] },
      { id: 'low_key_evening', label: 'Low-key evening', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['low key', 'cocktails', 'lounge', 'wine bar', 'evening'], avoidTags: ['high energy', 'club'] },
    ],
  },
  {
    id: 'food_focused_full_day',
    name: 'Food-Focused Full Day',
    description: 'Full day built around coffee, markets, lunch, tastings, dinner, and dessert or drinks.',
    slots: [
      { id: 'breakfast_coffee', label: 'Breakfast or coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['breakfast', 'coffee', 'cafe', 'bakery', 'pastry'] },
      { id: 'food_culture_stop', label: 'Market or food-culture stop', daypart: 'morning', acceptableCollections: ['attractions', 'dining'], preferredCollections: ['attractions'], intentTags: ['market', 'food culture', 'local food', 'culinary', 'tasting'] },
      { id: 'lunch', label: 'Lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'restaurant', 'local specialty'] },
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
      { id: 'morning_activity', label: 'Morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'outdoor', 'hike', 'tour', 'active', 'morning'] },
      { id: 'second_morning_activity', label: 'Second morning activity', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'viewpoint', 'outdoor', 'active', 'experience'] },
      { id: 'lunch', label: 'Lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'casual', 'refuel', 'local food'] },
      { id: 'afternoon_activity', label: 'Afternoon activity', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['adventure', 'afternoon', 'tour', 'outdoor', 'hands on'] },
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
      { id: 'evening_social_stop', label: 'Evening drinks, show, or social stop', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['cocktails', 'show', 'music', 'lounge', 'social', 'evening'] },
      { id: 'nightlife_stop', label: 'Nightlife stop', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['nightlife', 'club', 'bar', 'music', 'high energy'] },
      { id: 'late_night_nightlife', label: 'Late-night nightlife stop', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['late night', 'club', 'dance', 'after hours', 'nightlife'] },
    ],
  },
] as const

export function getDayShellTemplate(shellId: DayShellId | undefined): DayShellTemplate {
  return BUILT_IN_DAY_SHELLS.find((shell) => shell.id === shellId) ?? BUILT_IN_DAY_SHELLS[0]
}

