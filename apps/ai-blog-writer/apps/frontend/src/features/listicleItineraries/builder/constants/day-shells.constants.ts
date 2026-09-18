import type { DayShellId, DayShellSlot, DayShellTemplate } from '../../types'

export const DEFAULT_DAY_SHELL_ID: DayShellId = 'rich_standard_day'

export const BUILT_IN_DAY_SHELLS: ReadonlyArray<DayShellTemplate> = [
  {
    id: 'hands_on_local_day',
    name: 'Hands-On Local Day',
    description: 'A maker-focused day built around a hands-on class, local crafts, markets, and small food pauses.',
    slots: [
      { id: 'breakfast', label: 'Breakfast', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'market', label: 'Meet the local market', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'local-market' },
      { id: 'coffee', label: 'Coffee pause', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'workshop', label: 'Hands-on workshop', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'culture' },
      { id: 'lunch', label: 'Local lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'lunch' },
      { id: 'gallery', label: 'Craft gallery or design museum', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'museum-visit' },
      { id: 'shops', label: 'Independent makers and shops', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'shopping' },
      { id: 'sweet', label: 'Sweet treat', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'sweet-treat' },
      { id: 'dinner', label: 'Neighborhood dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
    ],
  },
  {
    id: 'gardens_and_slow_living',
    name: 'Gardens & Slow Living',
    description: 'A gentle late-start day with gardens, picnic provisions, a picnic setting, and scenic pauses.',
    slots: [
      { id: 'breakfast', label: 'Leisurely breakfast', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'garden', label: 'Garden wander', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'outdoor' },
      { id: 'market', label: 'Pick up picnic provisions', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'street-food' },
      { id: 'picnic', label: 'Picnic break', daypart: 'lunch', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'outdoor' },
      { id: 'view', label: 'Scenic viewpoint', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'scenic-viewpoint' },
      { id: 'coffee', label: 'Coffee and a quiet pause', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'sunset', label: 'Sunset stroll', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'sunset' },
      { id: 'dinner', label: 'Easy dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
    ],
  },

  {
    id: 'city_photo_walk',
    name: 'City Photo Walk',
    description: 'Architecture, neighborhood details, and golden-hour views, with food and coffee pauses between anchors.',
    slots: [
      { id: 'breakfast', label: 'Breakfast', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'walk', label: 'Architecture and neighborhood walk', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'morning-walk' },
      { id: 'landmark', label: 'Landmark anchor', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'landmark' },
      { id: 'coffee', label: 'Coffee pause', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'photo_stop', label: 'Photo stop', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'scenic-viewpoint' },
      { id: 'lunch', label: 'Local lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'lunch' },
      { id: 'gallery', label: 'Gallery or design stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'culture' },
      { id: 'sweet', label: 'Sweet treat', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'sweet-treat' },
      { id: 'sunset', label: 'Golden-hour viewpoint', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'sunset' },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
    ],
  },
  {
    id: 'markets_and_live_music',
    name: 'Markets & Live Music',
    description: 'A late-start day of markets, local culture, and independent shops leading into dinner and live music.',
    slots: [
      { id: 'breakfast', label: 'Late breakfast', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'market', label: 'Local market browse', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'local-market' },
      { id: 'lunch', label: 'Street-food lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'street-food' },
      { id: 'culture', label: 'Local arts and culture', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'culture' },
      { id: 'coffee', label: 'Coffee and downtime', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'shops', label: 'Independent shops', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'shopping' },
      { id: 'dinner', label: 'Pre-show dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
      { id: 'live_music', label: 'Live music', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: [], moment: 'nightlife' },
      { id: 'drinks', label: 'After-show drinks', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: [], moment: 'drinks' },
    ],
  },

  {
    id: 'rich_standard_day',
    name: 'Rich Standard Day',
    description: 'A full editorial canvas: main sights, meals, and smaller pauses. Trim stops to fit your chosen places.',
    slots: [
      { id: 'breakfast', label: 'Breakfast', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'morning_walk', label: 'Neighborhood wander', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'morning-walk' },
      { id: 'landmark', label: 'Must-see landmark', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'landmark' },
      { id: 'coffee_pause', label: 'Coffee pause', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'market_browse', label: 'Browse a local market', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'local-market' },
      { id: 'lunch', label: 'Local lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'lunch' },
      { id: 'culture', label: 'Museum or culture stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'culture' },
      { id: 'sweet_treat', label: 'Sweet treat', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'sweet-treat' },
      { id: 'sunset', label: 'Sunset viewpoint', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'sunset' },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
      { id: 'drinks', label: 'After-dinner drinks', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: [], moment: 'drinks' },
    ],
  },
  {
    id: 'work_and_wander_day',
    name: 'Work & Wander Day',
    description: 'A workday away with two work sessions, food breaks, fresh air, and an evening out. Choose work-friendly venues yourself.',
    slots: [
      { id: 'breakfast', label: 'Breakfast before work', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'breakfast' },
      { id: 'coworking', label: 'Morning coworking session', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'coworking-stop' },
      { id: 'coffee_pause', label: 'Coffee pause', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'coffee' },
      { id: 'lunch', label: 'Neighborhood lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'lunch' },
      { id: 'remote_work', label: 'Afternoon laptop session', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'remote-work' },
      { id: 'outdoor_reset', label: 'Fresh-air reset', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'outdoor' },
      { id: 'sunset', label: 'Sunset after signing off', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: [], moment: 'sunset' },
      { id: 'dinner', label: 'Dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: [], moment: 'dinner' },
    ],
  },

  {
    id: 'food_focused_full_day',
    name: 'Food-Focused Full Day',
    description: 'Follow local food from bakery and market ingredients to a regional lunch, a hands-on tasting, and a destination dinner, with a neighborhood breather between meals.',
    slots: [
      { id: 'morning_coffee', label: 'Bakery breakfast and first coffee', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['bakery', 'breakfast', 'local pastry'], moment: 'breakfast' },
      { id: 'market_tasting', label: 'Meet the ingredients at a local market', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['market', 'ingredients', 'food culture'], moment: 'local-market' },
      { id: 'street_food_bite', label: 'One signature street-food bite', daypart: 'late_morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['street food', 'regional specialty', 'small portion'], moment: 'street-food' },
      { id: 'local_tasting_lunch', label: 'Regional specialty lunch', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['regional food', 'local specialty', 'lunch'], moment: 'lunch' },
      { id: 'neighborhood_walk', label: 'Walk the neighborhood behind the cuisine', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['neighborhood', 'food heritage', 'walk'], moment: 'outdoor' },
      { id: 'afternoon_food_stop', label: 'Meet a maker for a small tasting', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['artisan', 'producer', 'tasting', 'small portion'], moment: 'culture' },
      { id: 'sunset', label: 'A scenic pause before dinner', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['sunset', 'view', 'relaxed'], moment: 'sunset' },
      { id: 'dinner', label: 'Destination dinner: local ingredients reimagined', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['local ingredients', 'regional cuisine', 'destination dinner'], moment: 'dinner' },
      { id: 'dessert_drinks', label: 'A local sweet to close the day', daypart: 'evening', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dessert', 'local sweet', 'small portion'], moment: 'sweet-treat' },
    ],
  },
  {
    id: 'adventure_full_day',
    name: 'Adventure Full Day',
    description: 'Build from a breakfast and gentle warm-up to one main outdoor adventure, then refuel, try a hands-on skill, and wind down with fresh air and sunset.',
    slots: [
      { id: 'breakfast', label: 'Fuel up before heading out', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['breakfast', 'hearty', 'early opening'], moment: 'breakfast' },
      { id: 'morning_walk', label: 'Easy trail or waterfront warm-up', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['walk', 'waterfront', 'easy trail'], moment: 'morning-walk' },
      { id: 'second_morning_activity', label: 'The main outdoor adventure', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['outdoor', 'adventure', 'active'], moment: 'active-adventure' },
      { id: 'scenic_pause', label: 'Catch your breath at a viewpoint', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['viewpoint', 'rest', 'scenery'], moment: 'scenic-viewpoint' },
      { id: 'lunch', label: 'A hearty local refuel', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['lunch', 'hearty', 'local food'], moment: 'lunch' },
      { id: 'hands_on_experience', label: 'Try a new skill with a local guide', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['guided activity', 'beginner friendly', 'hands on'], moment: 'guided-tour' },
      { id: 'second_afternoon_activity', label: 'Gentle garden or waterside cooldown', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['garden', 'waterfront', 'relaxed', 'easy walk'], moment: 'outdoor' },
      { id: 'sunset', label: 'Sunset reward after the active day', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['sunset', 'scenic', 'relaxed'], moment: 'sunset' },
      { id: 'dinner', label: 'A comfortable dinner to finish', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'hearty', 'casual', 'comfortable'], moment: 'dinner' },
    ],
  },
  {
    id: 'nightlife_full_day',
    name: 'Nightlife Full Day',
    description: 'Ease in with a late lunch, art, and coffee; move from rooftop sunset to dinner, cocktails, live music, and a final dance floor.',
    slots: [
      { id: 'late_start_lunch', label: 'Late lunch in the evening neighborhood', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['late lunch', 'brunch', 'social'], moment: 'lunch' },
      { id: 'recovery_friendly_activity', label: 'An easy gallery wander', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['gallery', 'art', 'relaxed'], moment: 'culture' },
      { id: 'coffee_pause', label: 'Coffee before the evening begins', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'quiet pause'], moment: 'coffee' },
      { id: 'rooftop_sunset', label: 'Watch the city shift from a rooftop', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['rooftop', 'sunset', 'city view'], moment: 'rooftop-stop' },
      { id: 'dinner', label: 'Dinner near the night’s venues', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['dinner', 'pre show', 'social'], moment: 'dinner' },
      { id: 'drinks_social', label: 'A signature cocktail and conversation', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['cocktail bar', 'signature cocktails', 'conversation'], moment: 'cocktails' },
      { id: 'entertainment', label: 'Live music: the evening’s main event', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['live music', 'performance', 'show'], moment: 'nightlife' },
      { id: 'exclusive_evening', label: 'A final dance floor', daypart: 'nightlife', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['dancing', 'club', 'late night'], moment: 'nightlife' },
      { id: 'late_bite', label: 'A small late-night bite on the way back', daypart: 'nightlife', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['late night food', 'street food', 'small portion'], moment: 'street-food' },
    ],
  },
  {
    id: 'premium_indulgence_day',
    name: 'Premium Indulgence Day',
    description: 'A leisurely progression through specialty coffee, art, independent design, scenic dining, and a restorative pause, ending with a destination dinner and refined nightcap.',
    slots: [
      { id: 'morning_coffee', label: 'Specialty coffee and a fine pastry', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['specialty coffee', 'pastry', 'refined'], moment: 'coffee' },
      { id: 'cultural_stop', label: 'A focused art or design collection', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['art museum', 'design', 'curated collection'], moment: 'museum-visit' },
      { id: 'design_shops', label: 'Browse independent designers', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['independent design', 'craft', 'boutique'], moment: 'shopping' },
      { id: 'scenic_lunch', label: 'A long lunch with a view', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['scenic lunch', 'terrace', 'waterfront'], moment: 'lunch' },
      { id: 'wellness_pause', label: 'A restorative spa or wellness pause', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['spa', 'wellness', 'restorative'], moment: 'wellness-break' },
      { id: 'break_refreshment', label: 'Tea and a delicate sweet', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['tea', 'patisserie', 'small portion'], moment: 'sweet-treat' },
      { id: 'sunset', label: 'A quiet golden-hour viewpoint', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['sunset', 'scenic', 'quiet'], moment: 'sunset' },
      { id: 'exclusive_dining', label: 'The day’s destination dinner', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['fine dining', 'tasting menu', 'reservation'], moment: 'dinner' },
      { id: 'exclusive_evening', label: 'A refined cocktail nightcap', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['cocktails', 'lounge', 'refined', 'nightcap'], moment: 'cocktails' },
    ],
  },
  {
    id: 'culture_and_stroll_day',
    name: 'Culture & Stroll Day',
    description: 'Read the city in layers: neighborhood streets, a historic site, local food, and a museum, followed by living craft, a sweet pause, sunset, and street-food supper.',
    slots: [
      { id: 'morning_coffee', label: 'Coffee in the old neighborhood', daypart: 'morning', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['coffee', 'cafe', 'neighborhood'], moment: 'coffee' },
      { id: 'morning_walk', label: 'Read the neighborhood through its streets', daypart: 'morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['architecture', 'neighborhood', 'walk'], moment: 'morning-walk' },
      { id: 'historic_anchor', label: 'The historic site that explains the area', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['history', 'heritage', 'historic site'], moment: 'historic-site' },
      { id: 'local_tasting_lunch', label: 'Lunch rooted in local tradition', daypart: 'lunch', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['traditional food', 'regional specialty', 'lunch'], moment: 'lunch' },
      { id: 'cultural_stop', label: 'A museum that connects the stories', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['museum', 'local history', 'art'], moment: 'museum-visit' },
      { id: 'living_craft', label: 'See local craft carried into the present', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['craft', 'artisan', 'workshop', 'living heritage'], moment: 'culture' },
      { id: 'sweet_pause', label: 'A neighborhood sweet and a seat', daypart: 'afternoon', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['local sweet', 'bakery', 'seating'], moment: 'sweet-treat' },
      { id: 'evening_stroll', label: 'A sunset stroll to the evening quarter', daypart: 'evening', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['sunset', 'promenade', 'walk'], moment: 'sunset' },
      { id: 'night_market_tasting', label: 'Street-food supper at the night market', daypart: 'dinner', acceptableCollections: ['dining'], preferredCollections: ['dining'], intentTags: ['night market', 'street food', 'supper'], moment: 'street-food' },
    ],
  },
] as const

export const DAY_SHELL_SLOT_PRESETS: ReadonlyArray<DayShellSlot> = [
  { id: 'hands_on_workshop', label: 'Hands-on workshop', daypart: 'late_morning', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['workshop', 'craft', 'class'], moment: 'culture' },
  { id: 'picnic_break', label: 'Picnic break', daypart: 'lunch', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['park', 'garden', 'picnic'], moment: 'outdoor' },
  { id: 'photo_stop', label: 'Photo stop', daypart: 'afternoon', acceptableCollections: ['attractions'], preferredCollections: ['attractions'], intentTags: ['photography', 'architecture', 'view'], moment: 'scenic-viewpoint' },
  { id: 'live_music', label: 'Live music', daypart: 'evening', acceptableCollections: ['nightlife'], preferredCollections: ['nightlife'], intentTags: ['live music', 'concert', 'jazz'], moment: 'nightlife' },
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
  return getAvailableDayShells(customShells).find((shell) => shell.id === shellId) ?? BUILT_IN_DAY_SHELLS.find((shell) => shell.id === DEFAULT_DAY_SHELL_ID)!
}
