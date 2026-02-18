export interface NightlifeOption {
  value: string;
  label: string;
  description: string;
}

export const PRICE_TIER_VALUES = ["$", "$$", "$$$", "$$$$"] as const;
export const PRICE_TIER_OPTIONS: NightlifeOption[] = [
  { value: "$", label: "$", description: "Entry-level pricing; affordable drinks and cover." },
  { value: "$$", label: "$$", description: "Moderate pricing; standard nightclub spend." },
  { value: "$$$", label: "$$$", description: "Premium pricing; elevated drinks, tables, and service." },
  { value: "$$$$", label: "$$$$", description: "Luxury pricing; top-tier VIP and bottle-service spend." },
];

export const CLUB_TYPE_VALUES = [
  "Night Club",
  "Lounge Club",
  "Cocktail Club",
  "Live Music Club",
  "Dance Club",
  "Rooftop Club",
  "Beach Club",
  "After-Hours Club",
] as const;
export const CLUB_TYPE_OPTIONS: NightlifeOption[] = [
  { value: "Night Club", label: "Night Club", description: "Classic high-energy dance-focused nightlife venue." },
  { value: "Lounge Club", label: "Lounge Club", description: "Comfort-first seating with music-driven social scene." },
  { value: "Cocktail Club", label: "Cocktail Club", description: "Cocktail program-led nightlife with curated ambiance." },
  { value: "Live Music Club", label: "Live Music Club", description: "Performance-forward venue with bands or live acts." },
  { value: "Dance Club", label: "Dance Club", description: "Dance-floor-centric format with strong DJ rotation." },
  { value: "Rooftop Club", label: "Rooftop Club", description: "Elevated rooftop environment with skyline positioning." },
  { value: "Beach Club", label: "Beach Club", description: "Coastal/open-air club format, often seasonal and destination-led." },
  { value: "After-Hours Club", label: "After-Hours Club", description: "Late-night continuation format with peak post-midnight traffic." },
];

export const MUSIC_VALUES = [
  "House",
  "EDM",
  "Techno",
  "Afro House",
  "Latin House",
  "Reggaeton",
  "Hip-Hop",
  "R&B",
  "Pop",
  "Open Format",
  "Commercial",
  "Disco/Funk",
  "Salsa",
  "Latin Mix",
  "Live DJ Sets",
  "Live Band",
] as const;
export const MUSIC_OPTIONS: NightlifeOption[] = [
  { value: "House", label: "House", description: "Four-on-the-floor dance music with broad club appeal." },
  { value: "EDM", label: "EDM", description: "Festival-style electronic sets with high drops and crowd energy." },
  { value: "Techno", label: "Techno", description: "Underground, driving electronic rhythm format." },
  { value: "Afro House", label: "Afro House", description: "Percussive house with global rhythmic influence." },
  { value: "Latin House", label: "Latin House", description: "House structure blended with Latin groove patterns." },
  { value: "Reggaeton", label: "Reggaeton", description: "Urban Latin mainstream nightlife staple." },
  { value: "Hip-Hop", label: "Hip-Hop", description: "Rap-driven club sets with strong peak-hour pull." },
  { value: "R&B", label: "R&B", description: "Melodic, groove-driven format for lounge-to-club transitions." },
  { value: "Pop", label: "Pop", description: "Mainstream crossover tracks for broad crowd compatibility." },
  { value: "Open Format", label: "Open Format", description: "Multi-genre DJ programming for mixed audiences." },
  { value: "Commercial", label: "Commercial", description: "High-recognition chart-focused party tracks." },
  { value: "Disco/Funk", label: "Disco/Funk", description: "Retro dance and groove-forward selections." },
  { value: "Salsa", label: "Salsa", description: "Partner-dance Latin format with social dance focus." },
  { value: "Latin Mix", label: "Latin Mix", description: "Blended Latin genres for broad regional appeal." },
  { value: "Live DJ Sets", label: "Live DJ Sets", description: "Program built around active live DJ performance." },
  { value: "Live Band", label: "Live Band", description: "Band-led music format with stage-performance cadence." },
];

export const VENUE_TYPE_VALUES = [
  "Nightclub",
  "Lounge",
  "Rooftop Venue",
  "Beach Venue",
  "Warehouse Venue",
  "Live Music Venue",
  "Supper Club",
  "Cocktail Bar + Dance Floor",
] as const;
export const VENUE_TYPE_OPTIONS: NightlifeOption[] = [
  { value: "Nightclub", label: "Nightclub", description: "Core nightlife format centered on music and dancing." },
  { value: "Lounge", label: "Lounge", description: "Social lounge setting with lower dance-floor emphasis." },
  { value: "Rooftop Venue", label: "Rooftop Venue", description: "Open skyline concept with destination appeal." },
  { value: "Beach Venue", label: "Beach Venue", description: "Outdoor/coastal nightlife setting." },
  { value: "Warehouse Venue", label: "Warehouse Venue", description: "Industrial large-format event/club environment." },
  { value: "Live Music Venue", label: "Live Music Venue", description: "Stage-forward venue with artist programming." },
  { value: "Supper Club", label: "Supper Club", description: "Dinner-to-nightlife hybrid experience." },
  { value: "Cocktail Bar + Dance Floor", label: "Cocktail + Dance", description: "Balanced bar program with active dance area." },
];

export const VENUE_SIZE_VALUES = ["Intimate", "Small", "Medium", "Large", "Massive"] as const;
export const VENUE_SIZE_OPTIONS: NightlifeOption[] = [
  { value: "Intimate", label: "Intimate", description: "Boutique capacity, highly personal atmosphere." },
  { value: "Small", label: "Small", description: "Lower-capacity room with focused crowd density." },
  { value: "Medium", label: "Medium", description: "Balanced capacity for regular weekly programming." },
  { value: "Large", label: "Large", description: "High-capacity nightlife venue with major peak swings." },
  { value: "Massive", label: "Massive", description: "Flagship-scale venue built for large event nights." },
];

export const SPACE_LAYOUT_VALUES = [
  "Indoor",
  "Outdoor Patio",
  "Rooftop",
  "Open-Air",
  "Multi-Room",
  "Main Dance Floor",
  "VIP Rooms",
  "Terrace",
  "Poolside",
] as const;
export const SPACE_LAYOUT_OPTIONS: NightlifeOption[] = [
  { value: "Indoor", label: "Indoor", description: "Fully enclosed climate-controlled club area." },
  { value: "Outdoor Patio", label: "Outdoor Patio", description: "Open-air side zone for social flow and breaks." },
  { value: "Rooftop", label: "Rooftop", description: "Elevated outdoor platform with skyline draw." },
  { value: "Open-Air", label: "Open-Air", description: "Non-enclosed concept with natural airflow." },
  { value: "Multi-Room", label: "Multi-Room", description: "Multiple rooms with differentiated programming." },
  { value: "Main Dance Floor", label: "Main Dance Floor", description: "Primary performance and crowd concentration area." },
  { value: "VIP Rooms", label: "VIP Rooms", description: "Dedicated premium seating/experience sections." },
  { value: "Terrace", label: "Terrace", description: "Semi-open exterior zone with seated standing mix." },
  { value: "Poolside", label: "Poolside", description: "Pool-adjacent nightlife setup, often seasonal." },
];

export const VIBE_VALUES = [
  "Upscale",
  "Exclusive",
  "High-Energy",
  "Underground",
  "Trendy",
  "Luxury",
  "Casual",
  "Immersive",
  "Artistic",
  "Local Favorite",
  "Tourist Hotspot",
] as const;
export const VIBE_OPTIONS: NightlifeOption[] = [
  { value: "Upscale", label: "Upscale", description: "Premium visual and service cues throughout the venue." },
  { value: "Exclusive", label: "Exclusive", description: "High-selectivity door and VIP-centric experience." },
  { value: "High-Energy", label: "High-Energy", description: "Consistently intense dance-floor and crowd momentum." },
  { value: "Underground", label: "Underground", description: "Alternative scene identity with niche programming." },
  { value: "Trendy", label: "Trendy", description: "Current social buzz and style-forward crowd profile." },
  { value: "Luxury", label: "Luxury", description: "Top-tier finishes, pricing, and guest expectation level." },
  { value: "Casual", label: "Casual", description: "Relaxed atmosphere with lower barrier to entry." },
  { value: "Immersive", label: "Immersive", description: "Experience-driven design, production, and sensory focus." },
  { value: "Artistic", label: "Artistic", description: "Creative direction-led aesthetic and programming." },
  { value: "Local Favorite", label: "Local Favorite", description: "Primarily supported by regular local audience." },
  { value: "Tourist Hotspot", label: "Tourist Hotspot", description: "Strong visitor demand and destination reputation." },
];

export const PEAK_HOURS_VALUES = [
  "10:00 PM - 12:00 AM",
  "11:00 PM - 1:00 AM",
  "12:00 AM - 2:00 AM",
  "1:00 AM - 3:30 AM",
  "2:00 AM - 4:00 AM",
  "3:00 AM - 5:00 AM",
] as const;
export const PEAK_HOURS_OPTIONS: NightlifeOption[] = [
  { value: "10:00 PM - 12:00 AM", label: "10 PM - 12 AM", description: "Early-night peak window." },
  { value: "11:00 PM - 1:00 AM", label: "11 PM - 1 AM", description: "Mainstream pre-midnight/midnight ramp." },
  { value: "12:00 AM - 2:00 AM", label: "12 AM - 2 AM", description: "Core midnight demand block." },
  { value: "1:00 AM - 3:30 AM", label: "1 AM - 3:30 AM", description: "Late-night heavy-intensity traffic window." },
  { value: "2:00 AM - 4:00 AM", label: "2 AM - 4 AM", description: "After-peak continuity period." },
  { value: "3:00 AM - 5:00 AM", label: "3 AM - 5 AM", description: "Deep late-night/after-hours primary period." },
];

export const TOURIST_PRESENCE_VALUES = ["Very Low", "Low", "Medium", "High", "Very High"] as const;
export const TOURIST_PRESENCE_OPTIONS: NightlifeOption[] = [
  { value: "Very Low", label: "Very Low", description: "Almost entirely local regular audience." },
  { value: "Low", label: "Low", description: "Primarily local with limited visitor traffic." },
  { value: "Medium", label: "Medium", description: "Balanced local and visitor mix." },
  { value: "High", label: "High", description: "Frequent tourist presence across peak nights." },
  { value: "Very High", label: "Very High", description: "Destination-level tourist concentration." },
];

export const MUSIC_FORMAT_VALUES = [
  "Open Format",
  "Genre-Focused",
  "Resident DJs",
  "Guest DJs",
  "International Headliners",
  "Live DJ + Live Act Hybrid",
  "Live Band Program",
  "Theme Nights",
] as const;
export const MUSIC_FORMAT_OPTIONS: NightlifeOption[] = [
  { value: "Open Format", label: "Open Format", description: "Flexible genre-mixing based on crowd response." },
  { value: "Genre-Focused", label: "Genre Focused", description: "Consistent genre identity per night/venue." },
  { value: "Resident DJs", label: "Resident DJs", description: "Core local resident roster anchors programming." },
  { value: "Guest DJs", label: "Guest DJs", description: "Rotating invited DJs lead set variation." },
  { value: "International Headliners", label: "International Headliners", description: "Global touring talent drives demand spikes." },
  { value: "Live DJ + Live Act Hybrid", label: "DJ + Live Hybrid", description: "Mixed format with DJ sets and live performers." },
  { value: "Live Band Program", label: "Live Band Program", description: "Night program primarily band/performance based." },
  { value: "Theme Nights", label: "Theme Nights", description: "Format changes by scheduled theme concept." },
];

export const SPEND_LEVEL_VALUES = ["$", "$$", "$$$", "$$$$"] as const;
export const SPEND_LEVEL_OPTIONS: NightlifeOption[] = [
  { value: "$", label: "$", description: "Low average spend per guest." },
  { value: "$$", label: "$$", description: "Standard nightlife spend per guest." },
  { value: "$$$", label: "$$$", description: "Premium spend profile with table demand." },
  { value: "$$$$", label: "$$$$", description: "Luxury spend profile with strong bottle-service dependence." },
];

export const DRESS_CODE_VALUES = [
  "Casual",
  "Smart Casual",
  "Upscale",
  "Dress to Impress",
  "Elegant",
  "No Sportswear",
  "Strict Door Policy",
  "Theme-Based",
] as const;
export const DRESS_CODE_OPTIONS: NightlifeOption[] = [
  { value: "Casual", label: "Casual", description: "Relaxed dress expectations with minimal restrictions." },
  { value: "Smart Casual", label: "Smart Casual", description: "Clean social attire expected; moderate restrictions." },
  { value: "Upscale", label: "Upscale", description: "Polished style expected across guest profile." },
  { value: "Dress to Impress", label: "Dress to Impress", description: "High-style visual standard encouraged at entry." },
  { value: "Elegant", label: "Elegant", description: "Formal-leaning evening attire expectations." },
  { value: "No Sportswear", label: "No Sportswear", description: "Athletic apparel restricted or discouraged." },
  { value: "Strict Door Policy", label: "Strict Door Policy", description: "Door staff applies selective attire screening." },
  { value: "Theme-Based", label: "Theme-Based", description: "Dress guidance tied to specific event nights." },
];

export const ENERGY_LEVEL_VALUES = ["Low", "Medium", "High", "Very High"] as const;
export const ENERGY_LEVEL_OPTIONS: NightlifeOption[] = [
  { value: "Low", label: "Low", description: "Conversation-first, low-intensity atmosphere." },
  { value: "Medium", label: "Medium", description: "Balanced social + dance energy." },
  { value: "High", label: "High", description: "Dance-heavy and crowd-dense momentum." },
  { value: "Very High", label: "Very High", description: "Maximum intensity, peak performance atmosphere." },
];

export const VIP_BOTTLE_SERVICE_VALUES = [
  "No",
  "Limited",
  "Yes",
  "Yes (Premium Tables)",
  "Request Only",
] as const;
export const VIP_BOTTLE_SERVICE_OPTIONS: NightlifeOption[] = [
  { value: "No", label: "No", description: "No dedicated bottle-service offering." },
  { value: "Limited", label: "Limited", description: "Small or occasional bottle-service availability." },
  { value: "Yes", label: "Yes", description: "Standard bottle-service is actively available." },
  { value: "Yes (Premium Tables)", label: "Yes (Premium)", description: "Premium-tier tables/bundles drive primary VIP sales." },
  { value: "Request Only", label: "Request Only", description: "Bottle service offered by pre-arrangement or inquiry." },
];

export const CROWD_PROFILE_VALUES = [
  "18-24",
  "21-30",
  "25-35",
  "20-40",
  "30-45",
  "Mixed",
] as const;
export const CROWD_PROFILE_OPTIONS: NightlifeOption[] = [
  { value: "18-24", label: "18-24", description: "Younger-entry segment emphasis." },
  { value: "21-30", label: "21-30", description: "Young professional nightlife segment." },
  { value: "25-35", label: "25-35", description: "Core urban professional audience." },
  { value: "20-40", label: "20-40", description: "Broad mixed-age nightlife audience." },
  { value: "30-45", label: "30-45", description: "Mature premium audience segment." },
  { value: "Mixed", label: "Mixed", description: "No dominant age profile; balanced age distribution." },
];

export const DAYTIME_RESTAURANT_VALUES = ["0", "1"] as const;
export const DAYTIME_RESTAURANT_OPTIONS: NightlifeOption[] = [
  { value: "0", label: "0", description: "No daytime restaurant operation." },
  { value: "1", label: "1", description: "Has daytime restaurant operation." },
];
