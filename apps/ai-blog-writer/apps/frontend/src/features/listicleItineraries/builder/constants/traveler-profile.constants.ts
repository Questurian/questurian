/**
 * Traveler Profile option taxonomy for the Generation Brief composer modal.
 * Six sections; every section is optional and multi-select except Budget
 * (single $–$$$$ pick).
 */

export const TRAVELER_TYPE_OPTIONS: readonly string[] = [
  'Solo traveler',
  'First-time solo traveler',
  'Couple on a romantic getaway',
  'Friends’ trip or group getaway',
  'Business traveler combining work and leisure',
  'Remote worker or digital nomad',
  'Luxury traveler',
  'Family with young children',
  'Family with teenagers',
  'Retiree or mature traveler',
  'First-time international traveler',
  'Frequent traveler looking beyond the main attractions',
  'Heritage or family-roots traveler',
  'Social media creator',
  'Travel photographer or filmmaker',
  'Food, music, fashion, or lifestyle creator',
  'Traveler considering relocation',
]

export const TRIP_MOTIVATION_OPTIONS: readonly string[] = [
  'Experience the destination like a local',
  'Reconnect with culture or family history',
  'Celebrate a special occasion',
  'Find romance',
  'Go out, dance, and stay up late',
  'Rest without feeling rushed',
  'Take on an adventure that pushes personal limits',
  'Create memorable content',
  'Learn something new',
  'Escape tourist-heavy places',
  'See the famous landmarks while gaining a deeper understanding of the place',
  'Make the most of free time during a work trip',
  'Find experiences children or teenagers will genuinely enjoy',
  'Plan a trip that feels meaningful, not just photogenic',
]

export type InterestGroup = {
  label: string
  options: readonly string[]
}

export const INTEREST_GROUPS: readonly InterestGroup[] = [
  {
    label: 'Food and Drink',
    options: [
      'Local cuisine',
      'Street food',
      'Family-run restaurants',
      'Fine dining',
      'Traditional cooking',
      'Contemporary interpretations of local food',
      'Food markets',
      'Bakeries and cafés',
      'Coffee culture',
      'Cocktail bars',
      'Wine, beer, and spirits',
      'Cooking classes',
      'Farm-to-table experiences',
      'Late-night food',
      'Restaurants popular with locals',
    ],
  },
  {
    label: 'Nightlife and Entertainment',
    options: [
      'Nightclubs and dancing',
      'Underground nightlife',
      'Rooftop bars',
      'Cocktail lounges',
      'Dive bars and neighborhood pubs',
      'Live music',
      'Electronic music and DJ events',
      'Latin, Afrobeat, reggaeton, hip-hop, rock, indie, or alternative scenes',
      'Karaoke',
      'Theater and musicals',
      'Late-night cultural events',
      'After-hours venues',
      'Upscale nightlife',
      'Relaxed social bars',
      'Places to meet other travelers',
      'Venues where locals actually go',
    ],
  },
  {
    label: 'Arts, Culture, and Identity',
    options: [
      'Arts and culture',
      'Museums and galleries',
      'Contemporary art',
      'Street art and murals',
      'Design and fashion',
      'Theater and performing arts',
      'Indigenous culture',
      'Religious heritage',
      'Cultural traditions',
      'Craftsmanship and artisan workshops',
    ],
  },
  {
    label: 'Creator and Photography Experiences',
    options: [
      'Iconic photo locations',
      'Lesser-known photo locations',
      'Sunrise and golden-hour spots',
      'Street photography',
      'Architecture photography',
      'Nature and wildlife photography',
      'Fashion and lifestyle shoots',
      'Cinematic locations',
      'Drone-friendly areas',
      'Colorful neighborhoods',
      'Content-friendly cafés and hotels',
      'Filming locations',
      'Local creator communities',
      'Creative collaborations',
      'Workshops and studio rentals',
      'Locations with reliable Wi-Fi and workspace',
      'Places that are visually compelling without feeling overexposed',
      'Experiences that provide a meaningful story, not only a backdrop',
    ],
  },
  {
    label: 'Adventure, Outdoors, and Shopping',
    options: ['Adventure and outdoors', 'Shopping'],
  },
]

export const BUDGET_OPTIONS: ReadonlyArray<{ value: '$' | '$$' | '$$$' | '$$$$'; description: string }> = [
  { value: '$', description: 'Budget' },
  { value: '$$', description: 'Moderate' },
  { value: '$$$', description: 'Upscale' },
  { value: '$$$$', description: 'Luxury' },
]

export const ACCOMMODATION_OPTIONS: readonly string[] = [
  'Social hostel',
  'Quiet hostel',
  'Budget hotel',
  'Boutique hotel',
  'Business hotel',
  'Luxury hotel',
  'Resort',
  'Vacation rental',
  'Historic property',
  'Accommodation near nightlife',
  'Accommodation in a residential neighborhood',
]

export const PRACTICAL_NEED_OPTIONS: readonly string[] = [
  'Walkability',
  'Public transportation',
  'Car-friendly routes',
  'Child-friendly facilities',
  'Teen-friendly experiences',
  'Accessibility',
  'Solo traveler safety',
  'Women traveling alone',
  'Language support',
  'Places suitable for working',
  'Late-night transportation',
  'Low-crowd experiences',
]
