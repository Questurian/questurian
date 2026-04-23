import type {
  AllowedVariationId,
  CameraPresetId,
  CaptureStyleId,
  CrowdCharacterId,
  EnvironmentEnhancementId,
  FilterLookId,
  FluxModelId,
  FluxSafetyToleranceId,
  ImageRecreationFormState,
  LensPresetId,
  LightingId,
  OptionGroup,
  PeopleHandlingId,
  PeoplePresenceId,
  PeopleStrategyId,
  PreservationStrengthId,
  PrimarySubjectEmphasisId,
  PromptPreset,
  SceneCategoryId,
  SceneCategoryOption,
  ShotPerspectiveId,
  SelectOption
} from './types'

export const IMAGE_RECREATION_PROMPTS_STORAGE_KEY =
  'image_recreation_prompts_form_v2'

export const DEFAULT_PROMPT_PRESET_ID = 'famous-landmark-no-people' as const

export const FLUX_MODEL_OPTIONS: SelectOption<FluxModelId>[] = [
  {
    id: 'flux-2-max',
    label: 'FLUX.2 Max',
    description:
      'Highest-precision FLUX.2 editing endpoint. Best when multi-reference fidelity matters more than speed or cost.',
    prompt: ''
  },
  {
    id: 'flux-2-pro-preview',
    label: 'FLUX.2 Pro Preview',
    description:
      'Latest continuously updated FLUX.2 [pro] endpoint. Best default when you want BFL’s newest improvements first.',
    prompt: ''
  },
  {
    id: 'flux-2-pro',
    label: 'FLUX.2 Pro (Pinned)',
    description:
      'Fixed FLUX.2 [pro] snapshot for more reproducible runs when you need a stable model target.',
    prompt: ''
  },
  {
    id: 'flux-2-flex',
    label: 'FLUX.2 Flex',
    description:
      'Same multi-reference editing flow, but with the FLEX model family for finer-grained controls and future guidance/steps tuning.',
    prompt: ''
  }
]

export const FLUX_SAFETY_TOLERANCE_OPTIONS: SelectOption<FluxSafetyToleranceId>[] =
  [
    {
      id: '0',
      label: '0 · Very strict',
      description:
        'Strongest moderation posture. Best when you want the most conservative input and output filtering.',
      prompt: ''
    },
    {
      id: '1',
      label: '1 · Strict',
      description:
        'Slightly more flexible than the strictest setting while still staying conservative.',
      prompt: ''
    },
    {
      id: '2',
      label: '2 · Balanced',
      description:
        'BFL’s default moderation level. Good starting point for normal production editing.',
      prompt: ''
    },
    {
      id: '3',
      label: '3 · Open',
      description:
        'More permissive than the default while still retaining moderation checks.',
      prompt: ''
    },
    {
      id: '4',
      label: '4 · More open',
      description:
        'Higher tolerance for edge-case prompts and edits. Use only when the default is too restrictive.',
      prompt: ''
    },
    {
      id: '5',
      label: '5 · Most open',
      description:
        'Most permissive FLUX.2 tolerance documented by BFL for these endpoints.',
      prompt: ''
    }
  ]

export const SCENE_CATEGORY_OPTIONS: SceneCategoryOption[] = [
  {
    id: 'landscape-only',
    label: 'Landscape only',
    description:
      'Pure landscape scene with terrain, atmosphere, and scale leading the image.',
    prompt:
      'Preserve the image as a true landscape scene with terrain, atmosphere, scale, and natural spatial depth defining the frame.',
    helperText:
      'Best when the frame is defined by landforms, open space, and atmosphere.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'scenic-viewpoint',
    label: 'Scenic viewpoint',
    description:
      'Lookout or overlook image built around a strong viewing position.',
    prompt:
      'Preserve the viewpoint structure, the sense of elevation or overlook, and the original depth cues across the frame.',
    helperText:
      'Useful for overlooks, terraces, and lookout points where the vista matters most.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'tourist-landmark',
    label: 'Tourist landmark',
    description:
      'Landmark-driven travel photo with the place itself as the dominant travel subject.',
    prompt:
      'Preserve the landmark as the defining travel subject while keeping the image rooted in a real destination context.',
    helperText:
      'Use this when the place matters more than the exact crowd condition.',
    recommendedPeoplePresence: 'spread-out-crowd'
  },
  {
    id: 'city-street-scene',
    label: 'City / street scene',
    description:
      'Urban street or plaza image with architecture, public space, and street rhythm.',
    prompt:
      'Preserve the real urban layout, street depth, storefronts or facades, and the original public-space rhythm of the scene.',
    helperText:
      'Best for plazas, street corners, walkways, and everyday city scenes.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'street-art-mural',
    label: 'Street art / mural',
    description:
      'Street-art scene built around a mural, painted wall, or graphic public artwork.',
    prompt:
      'Preserve the mural, painted wall, or street-art surface as the defining subject, keeping the artwork readable, grounded, and true to the original urban setting.',
    helperText:
      'Best for murals, graffiti walls, painted alleys, and other public art scenes.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'market-food-stall',
    label: 'Market / food stall',
    description:
      'Travel or street-market scene shaped by stalls, produce, counters, or food displays.',
    prompt:
      'Preserve the market layout, stall structure, display density, and the real flow of goods, tables, or vendor setups in the scene.',
    helperText:
      'Use for bazaars, food stalls, produce stands, and street-market travel shots.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'restaurant-interior',
    label: 'Restaurant interior',
    description:
      'Dining-room travel image shaped by tables, seating, lighting, and hospitality detail.',
    prompt:
      'Preserve the dining-room layout, table spacing, lighting mood, materials, and the believable hospitality character of the restaurant interior.',
    helperText:
      'Best for bistros, tasting rooms, destination restaurants, and indoor dining spaces.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'restaurant-exterior',
    label: 'Restaurant exterior',
    description:
      'Street-facing restaurant photo built around facade, terrace, signage, and curbside context.',
    prompt:
      'Preserve the facade, awnings, terrace or sidewalk setup, signage placement, and the real street context of the restaurant exterior.',
    helperText:
      'Use for storefront restaurants, patios, corner bistros, and travel dining exteriors.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'cafe-interior',
    label: 'Cafe interior',
    description:
      'Cafe interior with counter, seating, pastries, coffee bar, or cozy hospitality detail.',
    prompt:
      'Preserve the counter layout, seating density, pastry or coffee-bar setup, and the authentic lived-in feel of the cafe interior.',
    helperText:
      'Best for espresso bars, brunch cafes, bakery cafes, and compact indoor coffee spaces.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'cafe-exterior',
    label: 'Cafe exterior',
    description:
      'Sidewalk or street-facing cafe image built around facade, small tables, awnings, and pedestrian context.',
    prompt:
      'Preserve the storefront, outdoor tables, awnings, menu boards, and the real sidewalk rhythm of the cafe exterior.',
    helperText:
      'Use for travel cafe terraces, street-corner cafes, and destination coffee exteriors.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'cafe-restaurant-scene',
    label: 'Cafe / restaurant general',
    description:
      'Broad dining or cafe scene when the image is not specifically about the facade, interior, or food close-up.',
    prompt:
      'Preserve the table layout, seating rhythm, interior or terrace setup, and the real hospitality context of the original scene.',
    helperText:
      'Use this when the scene is dining-related but does not fit a more specific restaurant, cafe, or food category.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'plated-food-close-up',
    label: 'Plated food close-up',
    description:
      'Single plated dish or hero food shot where plating, garnish, and texture are the main subject.',
    prompt:
      'Preserve the exact dish identity, plating arrangement, garnish, plateware, and appetizing texture realism.',
    helperText:
      'Best for hero dishes, desserts, entrees, and close-up restaurant plates.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'tabletop-food-spread',
    label: 'Tabletop food spread',
    description:
      'Multi-dish tabletop scene with several plates, shared courses, or a full meal spread.',
    prompt:
      'Preserve the exact tabletop arrangement, plate count, servingware, spacing, and the believable dining context of the spread.',
    helperText:
      'Use for brunch spreads, tapas tables, shared meals, and top-down dining setups.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'coffee-drinks-table',
    label: 'Coffee / drinks table',
    description:
      'Coffee or drinks-focused travel image built around cups, glasses, saucers, or a small cafe-table setup.',
    prompt:
      'Preserve the cups, glasses, foam or crema, tabletop styling, and the authentic cafe-table context without turning it into a generic product shot.',
    helperText:
      'Best for espresso, cappuccino, aperitivo, cocktails at a cafe table, and drinks-with-view shots.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'bakery-pastry-display',
    label: 'Bakery / pastry display',
    description:
      'Bakery case, pastry counter, or dessert display built around repetition, texture, and edible detail.',
    prompt:
      'Preserve the pastry arrangement, tray or case structure, texture realism, and the inviting display logic of the bakery scene.',
    helperText:
      'Use for croissant counters, gelato cases, dessert displays, and pastry close-ups.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'bar-cocktail-scene',
    label: 'Bar / cocktail scene',
    description:
      'Bar or cocktail setting shaped by bottles, glassware, counter surfaces, and nightlife hospitality mood.',
    prompt:
      'Preserve the bar layout, bottle display, glassware, counter materials, and the believable hospitality mood of the scene.',
    helperText:
      'Best for cocktail bars, hotel bars, wine bars, and drinks-led nightlife travel photos.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'hotel-lobby-interior',
    label: 'Hotel lobby interior',
    description:
      'Hotel lobby or reception interior where seating, front desk, lighting, and circulation define the space.',
    prompt:
      'Preserve the lobby layout, seating clusters, reception or concierge area, materials, and the premium hospitality feel of the interior.',
    helperText:
      'Use for boutique-hotel lobbies, reception spaces, and resort common areas.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'hotel-room-interior',
    label: 'Hotel room interior',
    description:
      'Guest room or suite interior shaped by bed, furniture, window view, and hospitality styling.',
    prompt:
      'Preserve the room layout, bed and furniture placement, window relationship, styling details, and the believable scale of the hotel room.',
    helperText:
      'Best for hotel rooms, suites, boutique stays, and hospitality room reveals.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'spa-wellness-interior',
    label: 'Spa / wellness interior',
    description:
      'Wellness or spa interior driven by treatment-room calm, materials, water, and relaxation details.',
    prompt:
      'Preserve the spa layout, treatment or lounge details, material palette, and the calm hospitality atmosphere of the wellness interior.',
    helperText: 'Use for spas, hammams, sauna lounges, and wellness spaces.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'poolside-resort-scene',
    label: 'Poolside / resort scene',
    description:
      'Resort pool or beach-club scene shaped by loungers, umbrellas, water edge, and leisure atmosphere.',
    prompt:
      'Preserve the pool geometry, loungers, umbrellas, water reflections, and the believable resort atmosphere of the scene.',
    helperText:
      'Best for resort pools, beach clubs, cabanas, and vacation leisure setups.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'boutique-shopfront',
    label: 'Boutique / shopfront',
    description:
      'Travel retail facade or boutique storefront with display windows, signage, and pedestrian context.',
    prompt:
      'Preserve the storefront geometry, window displays, signage, and the real street context of the boutique exterior.',
    helperText:
      'Use for independent shops, souvenir stores, concept boutiques, and shopping streets.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'rooftop-terrace-view',
    label: 'Rooftop / terrace view',
    description:
      'Elevated city or scenic view anchored by a terrace, rooftop edge, or lookout platform.',
    prompt:
      'Preserve the elevated viewpoint, railing or terrace geometry, skyline relationship, and the original sense of height and openness.',
    helperText:
      'Useful for rooftops, terrace bars, lookout decks, and elevated city views.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'nightlife-neon-scene',
    label: 'Nightlife / neon street',
    description:
      'Night street or nightlife scene driven by signage, storefront light, and urban evening energy.',
    prompt:
      'Preserve the night-street layout, practical signage, storefront lighting, and the original after-dark energy of the location.',
    helperText:
      'Use for neon streets, nightlife corridors, evening alleys, and busy night travel scenes.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'architecture-exterior',
    label: 'Architecture exterior',
    description:
      'Exterior architectural subject with lines, massing, and facade detail.',
    prompt:
      'Preserve the architecture, exterior geometry, facade materials, and the original structural proportions of the scene.',
    helperText:
      'Use when buildings and exterior design details drive the image.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'architecture-interior',
    label: 'Architecture interior',
    description:
      'Interior architectural scene focused on form, layout, light, and surfaces.',
    prompt:
      'Preserve the interior layout, architectural lines, material realism, and the original sense of volume and scale.',
    helperText:
      'Best for lobbies, rooms, corridors, and designed interior spaces.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'museum-gallery-interior',
    label: 'Museum / gallery interior',
    description:
      'Museum, gallery, or cultural interior built around walls, display spacing, lighting, and visitor flow.',
    prompt:
      'Preserve the gallery layout, wall spacing, display or artwork placement, lighting, and the authentic cultural-space atmosphere.',
    helperText:
      'Best for museums, galleries, exhibition halls, and cultural interiors.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'portrait',
    label: 'Portrait',
    description:
      'Single-person image where one existing human subject is central.',
    prompt:
      'Preserve the portrait framing, pose intent, and the original relationship between the person and the surrounding scene.',
    helperText: 'Use when one existing person clearly leads the frame.',
    recommendedPeoplePresence: 'one-person'
  },
  {
    id: 'couple-friends-photo',
    label: 'Couple / friends photo',
    description: 'Two-person travel or lifestyle image with a shared moment.',
    prompt:
      'Preserve the shared two-person dynamic, spatial relationship, and the original environment supporting the image.',
    helperText:
      'Best for couple shots, friend travel photos, and paired subjects.',
    recommendedPeoplePresence: 'two-people'
  },
  {
    id: 'group-photo',
    label: 'Group photo',
    description:
      'Small group composition where multiple people are intentionally included.',
    prompt:
      'Preserve the group-photo intent, the original group size, and the balance between people and surrounding context.',
    helperText:
      'Use when a small group is intentionally posed or clearly central.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'lifestyle-candid-people',
    label: 'Lifestyle / candid people',
    description:
      'People-centered candid scene with natural, unforced activity.',
    prompt:
      'Preserve the candid human activity, the documentary feel of the moment, and the original environmental context.',
    helperText:
      'Useful for lifestyle travel scenes with natural human activity.',
    recommendedPeoplePresence: 'small-group'
  },
  {
    id: 'product-object',
    label: 'Product / object',
    description:
      'Object-driven scene where a product or standalone item is the key subject.',
    prompt:
      'Preserve the original object identity, product scale, supporting surfaces, and the scene setup around it.',
    helperText:
      'Use when the image is built around a physical object or product.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'nature-wilderness',
    label: 'Nature / wilderness',
    description:
      'Natural outdoor image focused on untamed terrain and atmosphere.',
    prompt:
      'Preserve the wilderness feel, terrain realism, atmospheric layering, and the unbuilt character of the environment.',
    helperText:
      'Best for forests, valleys, meadows, and remote natural scenes.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'beach-coastal',
    label: 'Beach / coastal',
    description:
      'Coastal scene shaped by shoreline, water, sky, and marine atmosphere.',
    prompt:
      'Preserve the shoreline geometry, water behavior, atmospheric haze, and the original coastal color relationships.',
    helperText: 'Use for beaches, coastlines, cliffs, and marine-edge views.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'mountain-hiking',
    label: 'Mountain / hiking',
    description:
      'Mountain or hiking scene with elevation, terrain, and environmental scale.',
    prompt:
      'Preserve the mountain scale, trail or terrain structure, depth through the landscape, and the natural environmental hierarchy.',
    helperText:
      'Best for alpine, trail, summit, and mountainous travel images.',
    recommendedPeoplePresence: 'no-people'
  },
  {
    id: 'desert-rock-formations',
    label: 'Desert / rock formations',
    description:
      'Arid landscape with geological form, texture, and open light.',
    prompt:
      'Preserve the desert terrain, rock-form structure, atmospheric dryness, and the original geological character of the scene.',
    helperText:
      'Use for dunes, canyons, mesas, arches, and other arid formations.',
    recommendedPeoplePresence: 'no-people'
  }
]

export const PEOPLE_STRATEGY_OPTIONS: SelectOption<PeopleStrategyId>[] = [
  {
    id: 'match-source',
    label: 'Match source',
    description:
      'Keep the people situation aligned with what the reference photo already shows.',
    prompt:
      "Preserve the source photo's people situation as-is unless later instructions explicitly refine it."
  },
  {
    id: 'keep',
    label: 'Keep people',
    description:
      'Preserve existing people naturally. If the source has no people, keep it people-free.',
    prompt:
      'Keep existing people natural and believable; if the source photo is already people-free, keep it people-free.'
  },
  {
    id: 'reduce',
    label: 'Reduce people',
    description:
      'Thin visible people naturally without turning the scene into an empty synthetic cleanup.',
    prompt:
      'Reduce visible people naturally while preserving a believable scene and avoiding obvious synthetic cleanup.'
  },
  {
    id: 'remove',
    label: 'Remove people',
    description:
      'Remove all visible people and keep the resulting scene convincingly people-free.',
    prompt:
      'Remove all visible people and keep the resulting scene convincingly people-free.'
  },
  {
    id: 'recast-or-add',
    label: 'Recast or add',
    description:
      'Allow the people layer to be recast or new plausible people to be introduced when needed.',
    prompt:
      'Allow the people layer to be recast or plausible people to be introduced when needed while keeping the place believable.'
  }
]

export const PEOPLE_PRESENCE_OPTIONS: SelectOption<PeoplePresenceId>[] = [
  {
    id: 'no-people',
    label: 'No people',
    description: 'The reference image contains no people at all.',
    prompt:
      'Preserve the image as a people-free scene and keep the frame entirely free of added human presence.'
  },
  {
    id: 'one-person',
    label: 'One person',
    description: 'Exactly one existing person is present in the scene.',
    prompt:
      'Preserve exactly one existing person as part of the original scene without changing who the subject is.'
  },
  {
    id: 'two-people',
    label: 'Two people',
    description: 'Exactly two existing people are present in the scene.',
    prompt:
      'Preserve exactly two existing people as the authentic human subjects already present in the reference image.'
  },
  {
    id: 'small-group',
    label: 'Small group',
    description: 'A handful of people are present without becoming a crowd.',
    prompt:
      'Preserve the small group of existing people without expanding the scene into a larger crowd or collapsing it into fewer subjects.'
  },
  {
    id: 'spread-out-crowd',
    label: 'Spread-out crowd',
    description:
      'People are dispersed across the frame but are not packed tightly together.',
    prompt:
      'Preserve dispersed people across the scene as part of the real setting while keeping the environment or landmark dominant.'
  },
  {
    id: 'dense-crowd',
    label: 'Dense crowd',
    description: 'Crowd density is a defining part of the original scene.',
    prompt:
      'Preserve the dense crowd as part of the real scene without turning background people into exaggerated foreground characters.'
  }
]

export const PEOPLE_HANDLING_OPTIONS: SelectOption<PeopleHandlingId>[] = [
  {
    id: 'match-reference-people-handling',
    label: 'Match reference / no change',
    description:
      'Do not force a people-handling rule. Let the reference image and other settings determine whether people stay, leave, or stay secondary.',
    prompt:
      'Do not force a specific people-handling rule beyond what the reference image and the other selected controls already imply. Keep human presence consistent with the source image unless another explicit setting changes it.'
  },
  {
    id: 'keep-every-person-as-is',
    label: 'Keep every person as-is',
    description: 'No added people, no removed people, no identity changes.',
    prompt:
      'Preserve the existing people exactly as they appear in the reference image, including count, scene role, and general placement. Do not add, remove, or replace any people.'
  },
  {
    id: 'keep-same-people-small-natural-changes',
    label: 'Keep same people, allow tiny natural changes',
    description:
      'No added or removed people. Same people stay in frame, but expressions, posture, and micro-details can soften naturally.',
    prompt:
      'Preserve the original people count while allowing only minor natural micro-variation for those same existing people. Do not add, remove, or replace any people.'
  },
  {
    id: 'keep-same-people-small-repositioning',
    label: 'Keep same people, allow small repositioning',
    description:
      'No added or removed people. Same people and same count remain, but they can shift to nearby believable positions.',
    prompt:
      'Preserve the same scene and the same people count while allowing only subtle reshuffling of existing people within plausible positions. Do not add, remove, or replace any people.'
  },
  {
    id: 'reduce-a-few-people',
    label: 'Remove a few people, keep the rest',
    description:
      'You may remove a small number of existing people, but do not add anyone new or replace the remaining people.',
    prompt:
      'Allow a slight reduction in people count by removing a small number of existing people and subtly rebalancing the remaining people. Do not add any new people or replace who the remaining people are.'
  },
  {
    id: 'remove-all-people',
    label: 'Remove everyone from the photo',
    description:
      'Clear the frame completely by removing all visible people. This mode forces a people-free final image.',
    prompt:
      'Remove all existing people from the frame and keep the final image convincingly people-free. Do not add any replacement people.'
  },
  {
    id: 'change-every-person-and-reshuffle',
    label: 'Change every person and reshuffle',
    description:
      'Recast the full human cast. You may replace people and adjust count only as needed to match the selected people presence.',
    prompt:
      'Do not preserve the original people identities. Recast every visible person, restyle them naturally, and reshuffle their positions so the human presence fits the selected scene setup believably. Only add or remove people when needed to match the selected people presence.'
  },
  {
    id: 'reshuffle-and-add-people-naturally',
    label: 'Rebalance people and add more naturally',
    description:
      'You may add new people and reshuffle placement, but do not remove existing people.',
    prompt:
      'Allow people to be reshuffled around the scene and introduce additional people when needed, as long as the overall result still feels naturally integrated, believable, and true to the location. Do not remove existing people.'
  },
  {
    id: 'people-secondary-environment-primary',
    label: 'Keep people secondary',
    description:
      'No added or removed people. People remain visible, but the place should read first.',
    prompt:
      'Keep existing people secondary to the environment so they support the scene without overtaking the frame. Do not add, remove, or replace any people.'
  },
  {
    id: 'environment-dominant-with-people',
    label: 'Keep environment dominant',
    description:
      'No added or removed people. Even with people present, the landmark or environment should stay clearly in charge.',
    prompt:
      'Keep the landmark or environment as the primary focus even when existing people remain in the scene. Do not add, remove, or replace any people.'
  },
  {
    id: 'custom-people-handling',
    label: 'Custom — describe what you want',
    description:
      'Write your own instruction for how people should be handled. Your text is inserted directly into the prompt as-is.',
    prompt: ''
  }
]

export const CROWD_CHARACTER_OPTIONS: SelectOption<CrowdCharacterId>[] = [
  {
    id: 'match-reference-crowd',
    label: 'Match reference crowd',
    description:
      'Keep the social feel, styling, and visitor energy close to the reference image.',
    prompt:
      'Keep the overall crowd character, social energy, and styling direction close to the reference image.'
  },
  {
    id: 'international-tourist-mix',
    label: 'International tourist mix',
    description:
      'A varied destination-travel crowd with believable sightseeing energy.',
    prompt:
      'If people are visible, give them the feel of an international tourist mix with varied travel styling, natural sightseeing behavior, and believable destination energy.'
  },
  {
    id: 'locals-dominant',
    label: 'Locals-dominant',
    description:
      'People should feel more like everyday locals than destination tourists.',
    prompt:
      'If people are visible, make them feel more like locals or everyday residents than overt tourists, with practical clothing and natural public-space behavior.'
  },
  {
    id: 'mixed-age-travelers',
    label: 'Mixed-age travelers',
    description: 'A believable spread of adult ages without feeling staged.',
    prompt:
      'If people are visible, give the scene a mixed-age traveler feel with natural variety in age, styling, and body language.'
  },
  {
    id: 'family-heavy-travelers',
    label: 'Family-heavy travelers',
    description:
      'Lean toward family travel groups and multi-person vacation behavior.',
    prompt:
      'If people are visible, lean toward a family-travel feel with small clusters, practical vacation clothing, and believable family-group behavior.'
  },
  {
    id: 'adult-travelers',
    label: 'Adult travelers',
    description:
      'Lean toward adults, couples, and friend groups rather than families.',
    prompt:
      'If people are visible, lean toward adult travelers, couples, and friend groups with believable vacation styling and relaxed destination behavior.'
  },
  {
    id: 'backpacker-travel-crowd',
    label: 'Backpacker travel crowd',
    description:
      'Casual, practical, mobile travel energy with relaxed styling.',
    prompt:
      'If people are visible, give the crowd a relaxed backpacker or independent-travel feel with casual clothing, practical bags, and organic movement.'
  },
  {
    id: 'stylish-city-weekend-crowd',
    label: 'Stylish city weekend crowd',
    description:
      'A polished urban crowd with fashionable but believable styling.',
    prompt:
      'If people are visible, give the crowd a stylish city-weekend feel with believable casual fashion, social energy, and natural public-space behavior.'
  },
  {
    id: 'understated-neutral-crowd',
    label: 'Understated neutral crowd',
    description:
      'Keep people visually quiet so they support the scene without making a statement.',
    prompt:
      'If people are visible, keep the crowd styling neutral, understated, and observational so people support the scene without becoming the main story.'
  }
]

export const PRIMARY_SUBJECT_OPTIONS: SelectOption<PrimarySubjectEmphasisId>[] =
  [
    {
      id: 'match-reference-subject-balance',
      label: 'Match reference / no change',
      description:
        'Do not force a new focal hierarchy. Keep the same subject-environment balance already present in the image.',
      prompt:
        'Do not force a new focal hierarchy. Keep the same subject, landmark, person, and environment balance that the reference image already establishes.'
    },
    {
      id: 'environment-first',
      label: 'Environment first',
      description: 'Terrain, architecture, or place should lead the frame.',
      prompt:
        'Keep the environment, spatial atmosphere, and scene structure as the primary focus of the final photograph.'
    },
    {
      id: 'landmark-first',
      label: 'Landmark first',
      description: 'The landmark should remain the main focal subject.',
      prompt:
        'Keep the landmark or defining destination feature as the primary focal subject of the image.'
    },
    {
      id: 'person-first',
      label: 'Person first',
      description:
        'Existing people lead the frame without changing who is present.',
      prompt:
        'Keep the existing person or people as the primary focal subjects without changing who is present or increasing their number.'
    },
    {
      id: 'balanced-scene',
      label: 'Balanced scene',
      description: 'Maintain the relationship between subject and environment.',
      prompt:
        'Maintain a balanced relationship between the main subject and the environment, matching the reference image intent.'
    }
  ]

export const CAMERA_PRESET_GROUPS: OptionGroup<CameraPresetId>[] = [
  {
    label: 'Flagship mirrorless',
    options: [
      {
        id: 'sony-a1',
        label: 'Sony A1',
        description:
          'Sony flagship with elite speed, detail, and polished modern fidelity.',
        prompt:
          'Use flagship-level digital clarity, controlled highlight handling, and premium modern image fidelity.'
      },
      {
        id: 'sony-a9-iii',
        label: 'Sony A9 III',
        description:
          'Press-and-action flagship with crisp fast-reportage energy.',
        prompt:
          'Use ultra-premium flagship rendering with crisp editorial timing, clean tonal separation, and top-tier full-frame realism.'
      },
      {
        id: 'sony-a7r-v',
        label: 'Sony A7R V',
        description:
          'High-resolution modern full-frame rendering with refined detail.',
        prompt:
          'Use crisp modern full-frame rendering, broad dynamic range, and clean high-resolution photographic detail.'
      },
      {
        id: 'canon-r1',
        label: 'Canon R1',
        description:
          'Canon flagship with top-tier press, sports, and editorial polish.',
        prompt:
          'Use flagship Canon rendering with confident subject definition, premium tonal control, and polished real-world color.'
      },
      {
        id: 'canon-r3',
        label: 'Canon R3',
        description:
          'Fast press-oriented full-frame body with clean professional rendering.',
        prompt:
          'Use high-end Canon press-style rendering with dependable color, confident detail, and believable editorial realism.'
      },
      {
        id: 'canon-r5',
        label: 'Canon R5',
        description: 'Clean high-detail output with polished color.',
        prompt:
          'Use high-detail modern digital capture with polished color, realistic contrast, and confident full-frame sharpness.'
      },
      {
        id: 'nikon-z9',
        label: 'Nikon Z9',
        description:
          'Nikon flagship with strong tonal separation and robust natural contrast.',
        prompt:
          'Use top-tier flagship capture with strong dynamic range, controlled contrast, and robust modern realism.'
      },
      {
        id: 'nikon-z8',
        label: 'Nikon Z8',
        description: 'Detailed, high-contrast flagship mirrorless rendering.',
        prompt:
          'Use detailed modern capture with strong dynamic range, clean tonal separation, and grounded high-end realism.'
      },
      {
        id: 'leica-sl3',
        label: 'Leica SL3',
        description:
          'Luxury full-frame rendering with refined micro-contrast and premium clarity.',
        prompt:
          'Use luxury full-frame rendering with refined micro-contrast, clean color discipline, and polished optical realism.'
      }
    ]
  },
  {
    label: 'Large-format and premium detail',
    options: [
      {
        id: 'hasselblad-x2d-100c',
        label: 'Hasselblad X2D 100C',
        description:
          'Ultra-premium medium-format digital look with calm depth and tonal richness.',
        prompt:
          'Use ultra-premium medium-format rendering with luxurious tonal depth, refined transitions, and composed photographic realism.'
      },
      {
        id: 'fujifilm-gfx-100s',
        label: 'Fujifilm GFX 100S',
        description:
          'Large-format-style digital rendering with depth and tonal richness.',
        prompt:
          'Use large-sensor realism with rich tonal depth, refined texture, and the calm precision of medium-format capture.'
      }
    ]
  },
  {
    label: 'Premium travel and reportage',
    options: [
      {
        id: 'sony-a7-iv',
        label: 'Sony A7 IV',
        description: 'Balanced full-frame travel camera rendering.',
        prompt:
          'Use balanced full-frame realism with strong dynamic range, natural contrast, and dependable travel-photo clarity.'
      },
      {
        id: 'canon-r6-mark-ii',
        label: 'Canon R6 Mark II',
        description: 'Natural, flexible full-frame travel rendering.',
        prompt:
          'Use natural modern full-frame rendering with soft but realistic tonal transitions and dependable real-world color.'
      },
      {
        id: 'nikon-zf',
        label: 'Nikon Zf',
        description: 'Modern digital capture with a subtly classic tonal feel.',
        prompt:
          'Use modern digital fidelity with a slightly classic tonal feel, restrained contrast, and realistic texture handling.'
      },
      {
        id: 'fujifilm-x-t5',
        label: 'Fujifilm X-T5',
        description:
          'Premium APS-C body with punchy travel color and classic controls.',
        prompt:
          'Use crisp premium APS-C travel realism with confident color, natural sharpness, and a slightly classic photographer-first feel.'
      },
      {
        id: 'fujifilm-x100vi',
        label: 'Fujifilm X100VI',
        description: 'Compact reportage camera feel with polished color.',
        prompt:
          'Use compact reportage realism with natural color depth, restrained sharpness, and an intentional street-photography feel.'
      },
      {
        id: 'leica-q3',
        label: 'Leica Q3',
        description:
          'Crisp premium reportage look with refined micro-contrast.',
        prompt:
          'Use premium reportage rendering with refined micro-contrast, clean edge definition, and believable full-frame depth.'
      },
      {
        id: 'leica-m11',
        label: 'Leica M11',
        description:
          'Digital rangefinder look with understated luxury and classic reportage discipline.',
        prompt:
          'Use premium digital rangefinder realism with understated color, crisp but natural rendering, and composed reportage character.'
      }
    ]
  },
  {
    label: 'Film / retro / vintage inspired',
    options: [
      {
        id: 'contax-t2',
        label: 'Contax T2',
        description:
          'Compact premium film-camera character with polished analog charm.',
        prompt:
          'Use premium compact-film character with soft analog texture, natural grain, and elegant highlight rolloff.'
      },
      {
        id: 'yashica-t4',
        label: 'Yashica T4',
        description:
          'Cult compact-film look with lively flash-era travel nostalgia.',
        prompt:
          'Use compact 35mm film character with casual analog charm, relaxed contrast, and believable point-and-shoot nostalgia.'
      },
      {
        id: 'leica-m6',
        label: 'Leica M6',
        description:
          'Classic rangefinder film rendering with understated analog texture.',
        prompt:
          'Use classic rangefinder-film character with organic contrast, gentle grain, and believable analog realism.'
      },
      {
        id: 'hasselblad-500cm',
        label: 'Hasselblad 500CM',
        description: 'Medium-format film depth and composed analog tonality.',
        prompt:
          'Use medium-format analog rendering with rich tonal separation, measured detail, and elegant film depth.'
      },
      {
        id: 'mamiya-7',
        label: 'Mamiya 7',
        description:
          'Clean medium-format travel rendering with film character.',
        prompt:
          'Use medium-format travel-film character with open tonal range, realistic texture, and composed analog clarity.'
      },
      {
        id: 'pentax-67',
        label: 'Pentax 67',
        description:
          'Large medium-format film rendering with depth and presence.',
        prompt:
          'Use large medium-format film character with dimensional depth, soft rolloff, and tactile analog texture.'
      },
      {
        id: 'canon-ae-1',
        label: 'Canon AE-1',
        description: 'Classic 35mm SLR film character.',
        prompt:
          'Use classic 35mm SLR film realism with subtle grain, grounded color, and lightly imperfect analog character.'
      },
      {
        id: 'nikon-fm2',
        label: 'Nikon FM2',
        description:
          'Mechanical 35mm film look with straightforward analog clarity.',
        prompt:
          'Use straightforward 35mm film realism with crisp analog texture, believable contrast, and restrained grain.'
      },
      {
        id: 'olympus-om-1',
        label: 'Olympus OM-1',
        description:
          'Compact 35mm SLR character with nimble travel-documentary energy.',
        prompt:
          'Use nimble 35mm film realism with compact-travel charm, practical analog texture, and honest documentary clarity.'
      },
      {
        id: 'minolta-cle',
        label: 'Minolta CLE',
        description:
          'Small rangefinder-film look with understated vintage reportage warmth.',
        prompt:
          'Use compact rangefinder-film character with gentle analog warmth, restrained contrast, and believable vintage reportage realism.'
      },
      {
        id: 'polaroid-sx-70',
        label: 'Polaroid SX-70',
        description: 'Instant-film softness with vintage bloom and nostalgia.',
        prompt:
          'Use instant-film character with gentle softness, blooming highlights, muted contrast, and honest analog imperfection.'
      }
    ]
  }
]

export const LENS_PRESET_GROUPS: OptionGroup<LensPresetId>[] = [
  {
    label: 'Modern and flagship lenses',
    options: [
      {
        id: '20mm-f1-8',
        label: '20mm f/1.8',
        description:
          'Ultra-wide premium prime for dramatic but controlled spatial depth.',
        prompt:
          'Use a premium ultra-wide prime look with strong environmental scale, controlled edge behavior, and believable near-to-far depth.'
      },
      {
        id: '24mm-f1-4',
        label: '24mm f/1.4',
        description: 'Wide fast prime for immersive environmental perspective.',
        prompt:
          'Use wide-angle environmental perspective with strong spatial depth, realistic edge behavior, and immersive scene coverage.'
      },
      {
        id: '24mm-f1-8',
        label: '24mm f/1.8',
        description:
          'Practical wide prime for travel, architecture, and environmental portraits.',
        prompt:
          'Use a practical wide-prime perspective with clean spatial depth, realistic framing, and versatile travel-photo coverage.'
      },
      {
        id: '28mm-f2',
        label: '28mm f/2',
        description: 'Balanced wide reportage perspective.',
        prompt:
          'Use a balanced wide reportage perspective with natural subject-environment relationships and believable edge rendering.'
      },
      {
        id: '35mm-f1-8',
        label: '35mm f/1.8',
        description:
          'Flexible documentary focal length with soft depth options.',
        prompt:
          'Use natural documentary perspective with realistic depth, restrained separation, and dependable subject framing.'
      },
      {
        id: '35mm-f1-4',
        label: '35mm f/1.4',
        description:
          'Classic storytelling focal length with premium depth control.',
        prompt:
          'Use classic storytelling perspective with shallow-but-believable depth, natural subject presence, and clean optical rendering.'
      },
      {
        id: '50mm-f1-2',
        label: '50mm f/1.2',
        description:
          'Flagship normal prime with premium subject separation and rich rendering.',
        prompt:
          'Use a flagship fast-normal prime look with luxurious subject separation, refined focus falloff, and polished premium optics.'
      },
      {
        id: '50mm-f1-4',
        label: '50mm f/1.4',
        description:
          'Natural normal perspective with strong subject separation.',
        prompt:
          'Use natural normal-lens perspective with believable subject separation, realistic facial proportions, and refined focus falloff.'
      },
      {
        id: '50mm-f1-8',
        label: '50mm f/1.8',
        description: 'Straightforward normal prime with clean realism.',
        prompt:
          'Use natural normal-lens perspective with clean rendering, practical depth, and restrained photographic realism.'
      },
      {
        id: '85mm-f1-2',
        label: '85mm f/1.2',
        description:
          'High-end portrait prime with premium compression and depth.',
        prompt:
          'Use a flagship portrait-prime look with flattering compression, rich depth, and premium subject isolation that still feels photographic.'
      },
      {
        id: '85mm-f1-8',
        label: '85mm f/1.8',
        description: 'Portrait-oriented telephoto perspective.',
        prompt:
          'Use flattering short-telephoto compression with realistic subject separation and natural spatial layering.'
      },
      {
        id: '90mm-f2',
        label: '90mm f/2',
        description:
          'Premium short telephoto look with refined micro-contrast and compression.',
        prompt:
          'Use a premium short-telephoto perspective with elegant compression, crisp detail, and refined depth transitions.'
      },
      {
        id: '135mm-f1-8',
        label: '135mm f/1.8',
        description:
          'Flagship telephoto prime with strong compression and cinematic isolation.',
        prompt:
          'Use a flagship telephoto-prime look with strong compression, clean background melt, and controlled long-lens realism.'
      },
      {
        id: '14-24mm-f2-8',
        label: '14-24mm f/2.8',
        description:
          'Flagship ultra-wide zoom for architecture, interiors, and epic landscapes.',
        prompt:
          'Use flagship ultra-wide zoom rendering with controlled geometry, powerful environmental coverage, and premium wide-angle realism.'
      },
      {
        id: '70-200mm-f2-8',
        label: '70-200mm f/2.8',
        description:
          'Compressed telephoto perspective with selective subject isolation.',
        prompt:
          'Use telephoto compression with controlled background separation, realistic perspective flattening, and premium long-lens detail.'
      },
      {
        id: '24-70mm-f2-8',
        label: '24-70mm f/2.8',
        description: 'Versatile zoom rendering for editorial travel realism.',
        prompt:
          'Use versatile pro-zoom rendering with realistic depth, dependable sharpness, and practical editorial framing.'
      },
      {
        id: '28-70mm-f2',
        label: '28-70mm f/2',
        description:
          'Flagship standard zoom with richer separation and premium rendering.',
        prompt:
          'Use a flagship standard-zoom look with premium depth, refined contrast, and polished editorial flexibility.'
      },
      {
        id: '16-35mm-f2-8',
        label: '16-35mm f/2.8',
        description:
          'Ultra-wide environmental coverage for architecture and landscapes.',
        prompt:
          'Use ultra-wide environmental coverage with believable geometry, strong depth cues, and realistic wide-angle optics.'
      },
      {
        id: '100-400mm-f4-5-5-6',
        label: '100-400mm f/4.5-5.6',
        description:
          'Long telephoto zoom for distant compression, overlooks, and observational detail.',
        prompt:
          'Use long-telephoto compression with distant observational framing, controlled atmospheric stacking, and believable far-subject detail.'
      }
    ]
  },
  {
    label: 'Vintage lenses and character glass',
    options: [
      {
        id: '21mm-vintage-ultra-wide',
        label: '21mm vintage ultra-wide',
        description:
          'Old-school ultra-wide look with stronger edge personality and architectural drama.',
        prompt:
          'Use vintage ultra-wide character with assertive spatial stretch, expressive edge behavior, and believable old-glass drama.'
      },
      {
        id: '35mm-vintage-rangefinder',
        label: '35mm vintage rangefinder lens',
        description:
          'Classic rangefinder perspective with gentle analog character.',
        prompt:
          'Use classic rangefinder perspective with gentle edge softness, organic contrast, and believable vintage optical character.'
      },
      {
        id: '40mm-vintage-pancake',
        label: '40mm vintage pancake',
        description:
          'Compact vintage lens look with understated softness and casual travel charm.',
        prompt:
          'Use a compact vintage pancake-lens feel with modest softness, honest contrast, and lightweight travel-camera character.'
      },
      {
        id: '50mm-vintage-fast-prime',
        label: '50mm vintage fast prime',
        description:
          'Normal vintage prime with softer contrast and analog glow.',
        prompt:
          'Use a vintage normal-prime look with softer contrast, subtle glow, and organic analog depth.'
      },
      {
        id: '85mm-vintage-portrait',
        label: '85mm vintage portrait lens',
        description: 'Portrait telephoto with classic analog softness.',
        prompt:
          'Use vintage portrait-lens compression with soft highlight rolloff, flattering depth, and natural analog rendering.'
      },
      {
        id: 'soft-vintage-film-lens',
        label: 'soft vintage film lens',
        description:
          'Dreamier vintage optical behavior while staying realistic.',
        prompt:
          'Use gentle vintage softness, mild blooming highlights, and analog imperfection while keeping the scene believable and photographic.'
      },
      {
        id: 'swirly-vintage-portrait-lens',
        label: 'swirly vintage portrait lens',
        description:
          'Character-heavy vintage portrait look with more expressive background rendering.',
        prompt:
          'Use a character-rich vintage portrait-lens look with expressive background swirl, softer contrast, and believable old-glass personality.'
      },
      {
        id: 'anamorphic-vintage-inspired',
        label: 'anamorphic vintage-inspired',
        description:
          'Cinematic old-glass feel with subtle stretch and controlled flare character.',
        prompt:
          'Use a restrained vintage-anamorphic-inspired look with subtle cinematic character, controlled flare behavior, and believable optical imperfection.'
      },
      {
        id: 'classic-medium-format-rendering',
        label: 'classic medium format lens rendering',
        description: 'Calm medium-format character with dimensional depth.',
        prompt:
          'Use classic medium-format lens character with dimensional depth, measured falloff, and refined analog realism.'
      },
      {
        id: '45mm-equivalent-medium-format',
        label: '45mm equivalent medium format lens',
        description:
          'Balanced medium-format-equivalent field of view for landscapes and viewpoints.',
        prompt:
          'Use a balanced medium-format-equivalent field of view with calm perspective, rich depth, and refined optical realism.'
      }
    ]
  }
]

export const CAPTURE_STYLE_OPTIONS: SelectOption<CaptureStyleId>[] = [
  {
    id: 'match-reference-style',
    label: 'Match reference / no change',
    description:
      'Keep the existing photographic treatment instead of steering the image toward a stronger style.',
    prompt:
      'Keep the reference image’s existing photographic treatment essentially as-is. Do not push it toward a more editorial, cinematic, commercial, documentary, or stylized finish unless another control explicitly requires it.'
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Polished publication-ready realism with controlled styling.',
    prompt:
      'Keep the result polished and publication-ready with refined composition and restrained editorial finish.'
  },
  {
    id: 'natural-documentary',
    label: 'Natural documentary',
    description: 'Grounded documentary realism with minimal artifice.',
    prompt:
      'Keep the result grounded, observational, and documentary in feel, with realism taking priority over stylization.'
  },
  {
    id: 'moody-documentary',
    label: 'Moody documentary',
    description:
      'Grounded documentary realism with more atmosphere, shadow shape, and tonal mood.',
    prompt:
      'Keep the result grounded and documentary in feel, but allow more atmospheric shadow shape, tonal depth, and restrained mood without drifting into theatrical stylization.'
  },
  {
    id: 'luxury-campaign',
    label: 'Luxury campaign',
    description: 'Premium commercial polish that still feels camera-real.',
    prompt:
      'Keep the result premium and aspirational with a luxury-travel polish that still feels like a real camera photograph.'
  },
  {
    id: 'hospitality-editorial',
    label: 'Hospitality editorial',
    description:
      'Premium hotel, resort, and dining photography with polished but believable warmth.',
    prompt:
      'Keep the result grounded in hospitality-editorial photography with polished warmth, inviting detail, and premium but believable hotel, resort, or dining presentation.'
  },
  {
    id: 'travel-photography',
    label: 'Travel photography',
    description:
      'Real-world destination photography with strong scene fidelity.',
    prompt:
      'Keep the result grounded in believable destination photography with clear place identity and realistic scene fidelity.'
  },
  {
    id: 'street-photography',
    label: 'Street photography',
    description: 'Reportage-style realism with public-space energy.',
    prompt:
      'Keep the result rooted in authentic street-photography energy with believable public-space timing and observation.'
  },
  {
    id: 'cinematic-still',
    label: 'Cinematic still',
    description:
      'Film-frame atmosphere with controlled drama while staying photographic and real.',
    prompt:
      'Keep the result grounded in cinematic-still photography with controlled atmosphere, deliberate tonal shape, and film-frame drama while still reading as a believable real photograph.'
  },
  {
    id: 'fine-art-landscape',
    label: 'Fine art landscape',
    description: 'Refined landscape treatment without losing realism.',
    prompt:
      'Keep the result refined and atmospheric with fine-art landscape restraint while staying true to natural realism.'
  },
  {
    id: 'filmic-vintage',
    label: 'Filmic vintage',
    description: 'Analog-inspired styling with restrained nostalgic character.',
    prompt:
      'Keep the result filmic and vintage-inspired with analog character, but still physically believable and photographic.'
  },
  {
    id: 'real-estate-architecture-clean',
    label: 'Real estate / architecture clean',
    description: 'Clean architecture-driven rendering with corrected realism.',
    prompt:
      'Keep the result clean, precise, and architecture-forward with realistic surfaces, lines, and well-controlled detail.'
  },
  {
    id: 'interior-design-editorial',
    label: 'Interior design editorial',
    description:
      'Refined interiors photography with materials, styling, and composition detail leading the frame.',
    prompt:
      'Keep the result grounded in interior-design editorial photography with refined material rendering, thoughtful styling emphasis, and polished composition without losing realism.'
  },
  {
    id: 'food-editorial',
    label: 'Food editorial',
    description:
      'Magazine-style food and dining imagery with appetizing realism and controlled styling.',
    prompt:
      'Keep the result grounded in food-editorial photography with appetizing realism, controlled styling, and believable texture, garnish, plating, and table detail.'
  },
  {
    id: 'commercial-product',
    label: 'Commercial product',
    description:
      'Clean product-focused photography with strong material clarity and controlled commercial polish.',
    prompt:
      'Keep the result grounded in commercial product photography with clean product emphasis, strong material clarity, and polished but believable commercial finish.'
  },
  {
    id: 'brand-social-content',
    label: 'Brand social content',
    description:
      'Modern polished content style for launches, campaigns, and brand storytelling.',
    prompt:
      'Keep the result grounded in polished brand-social-content photography with modern clarity, platform-friendly composition, and clean campaign energy without looking synthetic.'
  },
  {
    id: 'casual-candid',
    label: 'Casual candid',
    description: 'Relaxed natural image without heavy polish.',
    prompt:
      'Keep the result relaxed and candid with natural imperfections, everyday realism, and no over-staging.'
  }
]

export const SHOT_PERSPECTIVE_OPTIONS: SelectOption<ShotPerspectiveId>[] = [
  {
    id: 'match-reference-viewpoint',
    label: 'Match reference viewpoint',
    description:
      'Preserve the original camera height, angle, and spatial read as closely as possible.',
    prompt:
      'Keep the original camera height, angle, and viewpoint logic closely matched to the reference image.'
  },
  {
    id: 'eye-level-natural',
    label: 'Eye-level natural',
    description:
      'Neutral real-world standing viewpoint with familiar travel/editorial balance.',
    prompt:
      'Shift the image toward a natural eye-level camera position with grounded proportions, realistic human-scale perspective, and an authentic on-location feel.'
  },
  {
    id: 'low-angle-upward',
    label: 'Low angle upward',
    description:
      'Slightly lower camera height that adds presence and scale without becoming extreme.',
    prompt:
      'Use a controlled low-angle upward viewpoint that adds presence, scale, and architectural or subject stature while remaining physically believable.'
  },
  {
    id: 'ground-level-dramatic',
    label: 'Ground-level dramatic',
    description:
      'Near-ground camera position with strong foreground stretch and dramatic depth.',
    prompt:
      'Use a near-ground dramatic viewpoint with foreground-led depth, strong spatial pull, and believable wide-angle perspective without turning the scene into fantasy.'
  },
  {
    id: 'high-angle-downward',
    label: 'High angle downward',
    description:
      'Raised camera position looking down for cleaner layout and spatial overview.',
    prompt:
      'Use a clean high-angle downward viewpoint that reveals the scene layout more clearly while keeping proportions, scale, and geometry natural.'
  },
  {
    id: 'elevated-overlook',
    label: 'Elevated overlook',
    description:
      'Balcony, terrace, or stepped-up vantage that opens up depth through the scene.',
    prompt:
      'Reinterpret the shot from an elevated overlook vantage, as if photographed from a terrace, steps, or overlook point with expanded depth and readable spatial layering.'
  },
  {
    id: 'birds-eye-overhead',
    label: "Bird's-eye overhead",
    description:
      'Top-down overhead view emphasizing layout, patterns, and scene organization.',
    prompt:
      "Use a bird's-eye overhead viewpoint with a strong top-down read, clean scene organization, and realistic overhead geometry rather than abstract flattening."
  },
  {
    id: 'drone-oblique',
    label: 'Drone oblique',
    description:
      'Aerial-but-angled travel view that keeps depth, scale, and destination context visible.',
    prompt:
      'Use an oblique drone-style aerial perspective with believable elevation, readable destination context, and natural-looking scale relationships across the scene.'
  },
  {
    id: 'straight-on-frontal',
    label: 'Straight-on frontal',
    description:
      'Level, frontal viewpoint for symmetrical scenes, facades, and direct subject presentation.',
    prompt:
      'Use a straight-on frontal viewpoint with clean alignment, controlled symmetry, and a clear direct read of the subject or facade.'
  },
  {
    id: 'three-quarter-oblique',
    label: 'Three-quarter oblique',
    description:
      'Classic editorial angle that shows depth while keeping the subject legible.',
    prompt:
      'Use a three-quarter oblique viewpoint that reveals depth, side planes, and dimensionality while still keeping the subject immediately legible.'
  },
  {
    id: 'side-profile-angle',
    label: 'Side profile angle',
    description:
      'Profile-oriented side angle for motion, sequence, or strong lateral composition.',
    prompt:
      'Use a side-profile camera angle with believable lateral perspective, directional flow, and realistic subject proportions.'
  },
  {
    id: 'tilted-dynamic',
    label: 'Tilted dynamic',
    description:
      'Restrained dutch-angle energy for street, fashion, or kinetic travel images.',
    prompt:
      'Use a restrained dynamic tilt that adds motion and editorial energy without making the scene feel distorted, gimmicky, or unstable.'
  },
  {
    id: 'foreground-led-wide',
    label: 'Foreground-led wide',
    description:
      'Immersive near-to-far perspective that pulls foreground textures and objects into the frame.',
    prompt:
      'Use an immersive foreground-led wide perspective with strong near-to-far depth, believable scale falloff, and tactile environmental presence.'
  },
  {
    id: 'telephoto-observer',
    label: 'Telephoto observer',
    description:
      'More distant compressed viewpoint with observational travel/editorial character.',
    prompt:
      'Use a telephoto observer viewpoint with natural compression, slightly more distant camera placement, and a candid long-lens travel/editorial feel.'
  }
]

export const FILTER_LOOK_GROUPS: OptionGroup<FilterLookId>[] = [
  {
    label: 'Clean digital looks',
    options: [
      {
        id: 'neutral-no-filter',
        label: 'Neutral / no filter',
        description:
          'Clean natural color without an obvious applied filter treatment.',
        prompt:
          'Keep the color treatment neutral and photographic, with no obvious applied social-media filter look.'
      },
      {
        id: 'iphone-natural',
        label: 'iPhone natural',
        description:
          'Familiar modern smartphone look with clean color and approachable contrast.',
        prompt:
          'Use a modern iPhone-like natural look with clean color, approachable contrast, and realistic everyday travel-photo rendering.'
      },
      {
        id: 'iphone-vivid',
        label: 'iPhone vivid',
        description:
          'Popular punchier smartphone look with brighter color and contrast.',
        prompt:
          'Use an iPhone-like vivid look with slightly stronger color and contrast, while keeping skin, sky, and environmental detail realistic and controlled.'
      },
      {
        id: 'leica-natural',
        label: 'Leica natural',
        description:
          'Well-known premium reportage look with restrained color and micro-contrast.',
        prompt:
          'Use a Leica-like natural reportage color treatment with restrained saturation, refined micro-contrast, and polished editorial realism.'
      }
    ]
  },
  {
    label: 'Editorial film color',
    options: [
      {
        id: 'fujifilm-classic-chrome',
        label: 'Fujifilm Classic Chrome',
        description:
          'Well-known travel/editorial palette with muted saturation and refined contrast.',
        prompt:
          'Use a Classic Chrome-inspired travel/editorial palette with muted saturation, refined contrast, and subdued but believable color separation.'
      },
      {
        id: 'fujifilm-nostalgic-neg',
        label: 'Fujifilm Nostalgic Neg',
        description:
          'Warm cinema-leaning Fujifilm palette with soft contrast and nostalgic travel color.',
        prompt:
          'Use a Nostalgic Neg-inspired palette with warm editorial color, softer contrast, and understated cinematic nostalgia.'
      },
      {
        id: 'fujifilm-reala-ace',
        label: 'Fujifilm Reala Ace',
        description:
          'Balanced premium Fujifilm color with richer greens, blues, and polished travel realism.',
        prompt:
          'Use a Reala Ace-inspired palette with polished travel color, richer greens and blues, and clean premium realism.'
      },
      {
        id: 'fujifilm-pro-400h',
        label: 'Fujifilm Pro 400H',
        description:
          'Pastel-leaning film palette with airy greens and soft editorial light.',
        prompt:
          'Use a Fuji Pro 400H-inspired palette with airy greens, soft pastel color, and gentle editorial film restraint.'
      },
      {
        id: 'kodak-portra-400',
        label: 'Kodak Portra 400',
        description:
          'Popular editorial film look with warm natural skin and soft color rolloff.',
        prompt:
          'Use a Portra 400-inspired editorial film palette with warm natural color, soft highlight rolloff, and restrained analog richness.'
      },
      {
        id: 'kodak-portra-800',
        label: 'Kodak Portra 800',
        description:
          'Richer low-light color-negative look with warm shadows and cinematic travel mood.',
        prompt:
          'Use a Portra 800-inspired palette with richer low-light color, warm shadow depth, and premium nighttime film character.'
      },
      {
        id: 'kodak-gold-200',
        label: 'Kodak Gold 200',
        description:
          'Recognizable warm travel-film look with sunny nostalgic color.',
        prompt:
          'Use a Kodak Gold-inspired travel look with warm sunlit color, gentle nostalgic richness, and believable film-style warmth.'
      },
      {
        id: 'kodak-ektar-100',
        label: 'Kodak Ektar 100',
        description:
          'Saturated clean film look with vivid travel color and crisp daylight punch.',
        prompt:
          'Use an Ektar 100-inspired palette with clean vivid color, crisp daylight punch, and polished travel-photo saturation.'
      },
      {
        id: 'kodak-ultramax-400',
        label: 'Kodak Ultramax 400',
        description:
          'Casual consumer-film palette with bright color and familiar vacation-photo energy.',
        prompt:
          'Use an Ultramax 400-inspired palette with bright casual color, everyday travel warmth, and believable consumer-film nostalgia.'
      }
    ]
  },
  {
    label: 'Subtle modern vintage',
    options: [
      {
        id: 'modern-vintage-soft-warm',
        label: 'Modern vintage soft warm',
        description:
          'Modern editorial warmth with intact contrast and only a hint of analog softness.',
        prompt:
          'Use a modern-vintage treatment with gentle analog warmth, preserved contrast, subtle highlight rolloff, and a clean current editorial finish rather than a heavy retro effect.'
      },
      {
        id: 'modern-vintage-faded-clean',
        label: 'Modern vintage faded clean',
        description:
          'Very light fade with controlled contrast and contemporary polish.',
        prompt:
          'Use a clean modern-vintage fade with restrained black lift, preserved midtone contrast, and controlled color muting while keeping the image polished and contemporary.'
      },
      {
        id: 'clean-analog-color',
        label: 'Clean analog color',
        description:
          'Subtle analog color separation with crisp contrast and almost no obvious retro fade.',
        prompt:
          'Use a clean analog-inspired color treatment with crisp natural contrast, subtle film warmth, refined color separation, and minimal nostalgic styling so the image still feels modern.'
      },
      {
        id: 'soft-editorial-nostalgia',
        label: 'Soft editorial nostalgia',
        description:
          'Gentle nostalgic warmth with preserved clarity and magazine-like polish.',
        prompt:
          'Use a soft editorial nostalgia treatment with warm highlights, preserved contrast, polished clarity, and restrained analog mood without pushing the image into obvious vintage gimmickry.'
      },
      {
        id: 'subtle-analog-grain',
        label: 'Subtle analog grain',
        description:
          'Mostly modern color and contrast with ultra-fine film grain instead of dusty vintage specks.',
        prompt:
          'Use a mostly modern color treatment with preserved contrast and ultra-fine analog grain. Keep the grain subtle and even, not dusty, speckled, scratched, or damaged.'
      }
    ]
  },
  {
    label: 'Vintage and nostalgic color',
    options: [
      {
        id: 'cinestill-800t',
        label: 'CineStill 800T',
        description:
          'Popular tungsten-night film look with glowing practical lights and urban atmosphere.',
        prompt:
          'Use a CineStill 800T-inspired palette with tungsten-night color separation, glowing practical lights, and believable urban film mood.'
      },
      {
        id: 'kodachrome-64',
        label: 'Kodachrome 64',
        description:
          'Classic slide-film nostalgia with saturated travel color and old-magazine warmth.',
        prompt:
          'Use a Kodachrome 64-inspired palette with rich travel color, warm editorial nostalgia, and slide-film clarity.'
      },
      {
        id: 'agfa-vista-200',
        label: 'Agfa Vista 200',
        description:
          'Cheerful consumer-film palette with lively color and European travel nostalgia.',
        prompt:
          'Use an Agfa Vista-inspired palette with lively color, cheerful daylight warmth, and believable old-vacation-film character.'
      },
      {
        id: 'faded-print-vintage',
        label: 'Faded print vintage',
        description:
          'Softly aged print look with lifted blacks and worn nostalgic color.',
        prompt:
          'Use a faded vintage-print treatment with lifted blacks, softened contrast, and gently aged travel color.'
      },
      {
        id: 'faded-disposable-film',
        label: 'Faded disposable film',
        description:
          'Vacation-snapshot look with soft flash-era color, mild haze, and disposable-camera charm.',
        prompt:
          'Use a faded disposable-film look with casual flash-era nostalgia, mild haze, and believable imperfect vacation color.'
      },
      {
        id: 'dusty-postcard-vintage',
        label: 'Dusty postcard vintage',
        description:
          'Warm printed-postcard feel with dusty highlights and sun-aged travel color.',
        prompt:
          'Use a dusty postcard-style vintage palette with warm printed color, sun-aged highlights, and restrained souvenir-photo nostalgia.'
      },
      {
        id: 'sun-faded-travel-print',
        label: 'Sun-faded travel print',
        description:
          'Aged holiday-print feel with warm fading, softened contrast, and believable old-photo wear.',
        prompt:
          'Use a sun-faded travel-print palette with warm faded color, softened contrast, and believable aged-photo nostalgia.'
      },
      {
        id: 'retro-chrome-slide',
        label: 'Retro chrome slide',
        description:
          'Richer retro slide color with cleaner contrast and glossy travel-magazine character.',
        prompt:
          'Use a retro chrome-slide palette with richer color, glossy travel-magazine vibrancy, and controlled vintage slide-film character.'
      },
      {
        id: 'warm-archive-postcard',
        label: 'Warm archive postcard',
        description:
          'Archived print look with paper warmth, gentle age fade, and old-travel keepsake character.',
        prompt:
          'Use a warm archive-postcard treatment with gentle paper warmth, mild age fade, and believable old-travel-print character.'
      },
      {
        id: 'expired-color-negative',
        label: 'Expired color negative',
        description:
          'Unpredictable analog color shifts with restrained old-film imperfection.',
        prompt:
          'Use an expired color-negative feel with restrained analog color shifts, imperfect balance, and believable old-film character.'
      }
    ]
  },
  {
    label: 'Black-and-white film',
    options: [
      {
        id: 'ilford-hp5-bw',
        label: 'Ilford HP5+ B&W',
        description:
          'Classic documentary black-and-white look with open grain and natural tonal range.',
        prompt:
          'Use an Ilford HP5 Plus-inspired black-and-white film look with open grain, natural tonal range, and grounded documentary realism.'
      },
      {
        id: 'kodak-tri-x-400',
        label: 'Kodak Tri-X 400',
        description:
          'Punchier black-and-white street-film look with classic reportage grit.',
        prompt:
          'Use a Kodak Tri-X-inspired black-and-white look with punchier contrast, classic reportage grit, and believable analog grain.'
      }
    ]
  }
]

export const FILTER_LOOK_OPTIONS = FILTER_LOOK_GROUPS.flatMap(
  (group) => group.options
)

export const LIGHTING_OPTION_GROUPS: OptionGroup<LightingId>[] = [
  {
    label: 'Reference',
    options: [
      {
        id: 'match-reference-lighting',
        label: 'Match reference / no change',
        description:
          'Keep the existing lighting mood and direction instead of steering toward a new time of day or setup.',
        prompt:
          'Keep the reference lighting setup essentially as-is. Do not push the image toward a different time of day, weather mood, or artificial lighting scheme unless the rest of the scene already supports it.'
      }
    ]
  },
  {
    label: 'Direct sun',
    options: [
      {
        id: 'clear-morning-sun',
        label: 'Clear morning sun',
        description:
          'Lower-angle direct sun with fresh air clarity and distinct natural shadows.',
        prompt:
          'Use clear morning sun with fresh atmospheric clarity, direct low-angle light, and natural shadow definition.'
      },
      {
        id: 'soft-morning-light',
        label: 'Soft morning light',
        description:
          'Gentle early daylight with soft contrast, lighter haze, and calmer shadows.',
        prompt:
          'Use soft early-daylight illumination, fresh atmosphere, gentle contrast, and believable morning clarity.'
      },
      {
        id: 'pastel-sunrise-light',
        label: 'Sunrise pastel glow',
        description:
          'Very early sunrise light with pale warm color in the sky and delicate contrast.',
        prompt:
          'Use very early sunrise light with pale peach-pink sky color, low-angle sun, and delicate soft contrast.'
      },
      {
        id: 'clear-bright-midday-sun',
        label: 'Clear midday sun',
        description:
          'Bright direct daylight with clean visibility, blue-sky clarity, and crisp shadows.',
        prompt:
          'Use clear sunny daylight, blue-sky clarity, natural visibility, and crisp realistic shadows.'
      },
      {
        id: 'golden-hour',
        label: 'Golden hour',
        description:
          'Warm lower-angle sunlight with longer, softer shadows and richer color.',
        prompt:
          'Use warm late-day sunlight, long soft shadows, and realistic color.'
      },
      {
        id: 'sunset-glow',
        label: 'Sunset warm glow',
        description:
          'Sunset light with warm evening color, softened contrast, and a natural horizon glow.',
        prompt:
          'Use realistic sunset light, warm evening color, and natural atmospheric softness.'
      },
      {
        id: 'backlit-sunlight',
        label: 'Backlit direct sun',
        description:
          'Direct sun behind the subject with controlled flare, rim light, and preserved detail.',
        prompt:
          'Use realistic backlit sunlight with controlled flare, believable rim light, and preserved scene detail.'
      }
    ]
  },
  {
    label: 'Sun filtered by clouds / haze',
    options: [
      {
        id: 'sun-through-thin-cloud',
        label: 'Sun through thin cloud',
        description:
          'Visible sun softened by a bright cloud veil for gentler shadows and luminous sky detail.',
        prompt:
          'Use sunlight filtered through thin cloud, with softened edges, bright cloud detail, and realistic low-contrast shadowing.'
      },
      {
        id: 'broken-cloud-sun',
        label: 'Broken clouds with sun',
        description:
          'Alternating patches of sun and cloud with selective highlights and moving shadow breaks.',
        prompt:
          'Use partly cloudy daylight with intermittent direct sun, selective bright patches, and believable cloud-shadow variation.'
      },
      {
        id: 'hazy-afternoon-light',
        label: 'Hazy afternoon sun',
        description:
          'Bright afternoon light softened by haze, humidity, dust, or atmospheric diffusion.',
        prompt:
          'Use hazy afternoon brightness, softened distance detail, and believable atmospheric diffusion.'
      },
      {
        id: 'after-rain-sunbreaks',
        label: 'Post-rain sun breaks',
        description:
          'Fresh clearing weather with sun returning through retreating clouds and damp-air luminosity.',
        prompt:
          'Use clearing-weather light with fresh post-rain atmosphere, sun breaking through clouds, and realistic wet-air luminosity.'
      }
    ]
  },
  {
    label: 'Cloud cover / overcast',
    options: [
      {
        id: 'overcast-soft-light',
        label: 'Soft overcast',
        description:
          'Soft diffused daylight with muted highlights, gentle contrast, and full cloud cover.',
        prompt:
          'Use soft diffused light, gentle contrast, realistic cloud cover, and muted highlights.'
      },
      {
        id: 'bright-high-overcast',
        label: 'Bright high overcast',
        description:
          'Bright cloud cover with no direct sun, good visibility, and broad soft highlights.',
        prompt:
          'Use bright high-overcast daylight with no direct sun, broad soft highlights, and clean neutral visibility.'
      },
      {
        id: 'diffused-cloudy-daylight',
        label: 'Cloud-filtered daylight',
        description:
          'Cloud-filtered daylight with even tonal balance and subdued but not dark brightness.',
        prompt:
          'Use evenly diffused cloudy daylight, calm tonal balance, and realistic subdued brightness.'
      },
      {
        id: 'heavy-overcast-dark-clouds',
        label: 'Heavy dark overcast',
        description:
          'Dense gray cloud cover with darker mood, lower brightness, and minimal direct highlights.',
        prompt:
          'Use heavy dark overcast with dense cloud cover, low contrast, and realistically subdued brightness.'
      },
      {
        id: 'dramatic-storm-light',
        label: 'Storm clouds / selective sun',
        description:
          'Moody storm cloud mass with isolated brighter breaks and strong atmospheric tension.',
        prompt:
          'Use stormy cloud mass, isolated sun breaks, and realistic atmospheric drama without turning the scene artificial.'
      },
      {
        id: 'flat-neutral-daylight',
        label: 'Neutral low-drama daylight',
        description:
          'Low-drama daylight with restrained contrast, accurate color, and minimal stylization.',
        prompt:
          'Use flat neutral daylight with restrained contrast, accurate color, and an honest low-drama photographic feel.'
      }
    ]
  },
  {
    label: 'Evening / night',
    options: [
      {
        id: 'blue-hour',
        label: 'Blue hour',
        description:
          'Cool early-evening light with a calm dusk atmosphere and subtle ambient glow.',
        prompt:
          'Use cool ambient dusk light and a natural early-evening atmosphere.'
      },
      {
        id: 'after-sunset-twilight',
        label: 'After-sunset twilight',
        description:
          'Soft ambient evening light after the sun has dropped below the horizon, with no direct sun remaining.',
        prompt:
          'Use ambient twilight after sunset, with soft sky glow, no direct sun, and controlled low-light realism.'
      },
      {
        id: 'night-city-lights',
        label: 'Night city lights',
        description:
          'Urban night exposure driven by practical light sources and believable darkness.',
        prompt:
          'Use realistic urban night exposure, practical lights, controlled highlights, and believable darkness.'
      },
      {
        id: 'mixed-urban-lighting',
        label: 'Mixed city lights',
        description:
          'Layered city lighting from signage, streetlights, windows, and ambient spill.',
        prompt:
          'Use layered city lighting from practical sources with realistic color contrast and controlled highlight spill.'
      }
    ]
  },
  {
    label: 'Indoor',
    options: [
      {
        id: 'window-light',
        label: 'Window light',
        description: 'Natural indoor light entering through windows.',
        prompt:
          'Use natural window light with believable interior falloff, gentle shadowing, and realistic directional softness.'
      },
      {
        id: 'indoor-general',
        label: 'Indoor general',
        description:
          'Natural-looking indoor light without a stylized production setup.',
        prompt:
          'Use believable indoor ambient light with natural room falloff, realistic practical-light influence, and restrained contrast that still feels like a real interior photograph.'
      },
      {
        id: 'indoor-production',
        label: 'Indoor production',
        description:
          'Controlled indoor lighting with a polished production or editorial setup.',
        prompt:
          'Use a controlled indoor production-lighting setup with believable key, fill, and practical-light balance while keeping the result grounded as a real photograph rather than a synthetic studio render.'
      }
    ]
  }
]

export const LIGHTING_OPTIONS: SelectOption<LightingId>[] =
  LIGHTING_OPTION_GROUPS.flatMap((group) => group.options)

export const PRESERVATION_STRENGTH_OPTIONS: SelectOption<PreservationStrengthId>[] =
  [
    {
      id: 'match-reference-preservation',
      label: 'Match reference / no change',
      description:
        'Do not add extra preservation pressure beyond the normal reference anchoring already in the prompt.',
      prompt:
        'Do not add extra preservation pressure beyond the normal reference anchoring rules. Keep the image faithful to the source without pushing it toward a stricter or looser preservation mode.'
    },
    {
      id: 'strict',
      label: 'Strict',
      description: 'Preserve the scene very closely.',
      prompt:
        'Preserve the scene structure, subject count, composition intent, and major elements very closely.'
    },
    {
      id: 'balanced',
      label: 'Balanced',
      description:
        'Preserve the core image while allowing subtle natural variation.',
      prompt:
        'Preserve the core image faithfully while allowing subtle natural variation that does not change the image identity.'
    },
    {
      id: 'flexible',
      label: 'Flexible',
      description:
        'Allow restrained reinterpretation while keeping the scene category intact.',
      prompt:
        'Preserve the scene category and core subject while allowing restrained reinterpretation of minor details.'
    }
  ]

export const ALLOWED_VARIATION_OPTIONS: SelectOption<AllowedVariationId>[] = [
  {
    id: 'no-variation',
    label: 'No variation',
    description: 'Stay as faithful to the original image as possible.',
    prompt: 'Allow no variation beyond faithful realism cleanup.'
  },
  {
    id: 'small-environmental-cleanup',
    label: 'Small environmental cleanup only',
    description:
      'Permit only very minor cleanup of distractions already in the scene.',
    prompt:
      'Limit changes to small environmental cleanup only, such as reducing minor distractions or visual noise without altering existing subjects.'
  },
  {
    id: 'small-wardrobe-changes',
    label: 'Small wardrobe changes for existing people only',
    description:
      'Permit only tiny clothing adjustments for people already present.',
    prompt:
      'Allow only small wardrobe-detail changes for people already present, without changing identity, count, or the scene role of those people.'
  },
  {
    id: 'small-positional-shifts',
    label: 'Small positional shifts for existing people only',
    description: 'Permit only subtle repositioning of existing people.',
    prompt:
      'Allow only small positional shifts for people already present, without changing subject count or creating new focal subjects.'
  },
  {
    id: 'minor-secondary-detail-changes',
    label: 'Minor secondary detail changes only',
    description: 'Permit only restrained changes to minor secondary details.',
    prompt:
      'Allow only minor changes to secondary details while keeping the core composition, subject count, and scene identity intact.'
  }
]

export const ENVIRONMENT_ENHANCEMENT_OPTIONS: SelectOption<EnvironmentEnhancementId>[] =
  [
    {
      id: 'match-reference-environment',
      label: 'Match reference / no change',
      description:
        'Do not push additional realism enhancement beyond what the source image already has.',
      prompt:
        'Do not push extra environmental realism enhancement. Keep the atmosphere, surface detail, haze, and depth treatment close to the reference image unless other selected controls require a change.'
    },
    {
      id: 'minimal',
      label: 'Minimal',
      description: 'Use restrained realism cleanup only.',
      prompt:
        'Apply only restrained realism cleanup with subtle improvements to atmospheric perspective, shadow behavior, and color fidelity.'
    },
    {
      id: 'moderate-realism-boost',
      label: 'Moderate realism boost',
      description: 'Improve realism clearly without pushing the image too far.',
      prompt:
        'Moderately boost realism in the sky, atmosphere, terrain or architecture detail, shadow behavior, color depth, and light falloff while staying faithful to the original scene.'
    },
    {
      id: 'strong-realism-boost',
      label: 'Strong realism boost',
      description: 'Push realism harder while keeping the scene itself intact.',
      prompt:
        'Strongly enhance realism in atmospheric perspective, haze layering, terrain or building detail, sky fidelity, shadow behavior, color depth, and optical light falloff while keeping the underlying scene intact.'
    }
  ]

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'famous-landmark-no-people',
    label: 'Famous landmark, no people',
    description:
      'Strict landmark-preservation preset with clean midday travel-photo realism and no added tourists.',
    values: {
      sceneCategory: 'tourist-landmark',
      peopleStrategy: 'remove',
      cameraPreset: 'sony-a7r-v',
      lensPreset: '24mm-f1-4',
      captureStyle: 'travel-photography',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'neutral-no-filter',
      lighting: 'clear-bright-midday-sun',
      preservationStrength: 'strict',
      environmentEnhancement: 'moderate-realism-boost',
      creativeDirection: '',
      referenceHasPeople: false
    }
  },
  {
    id: 'desert-landscape-editorial',
    label: 'Desert landscape, no people',
    description:
      'Golden-hour desert preset for empty terrain, editorial polish, and strong geological realism.',
    values: {
      sceneCategory: 'desert-rock-formations',
      peopleStrategy: 'remove',
      cameraPreset: 'sony-a7r-v',
      lensPreset: '35mm-f1-8',
      captureStyle: 'editorial',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'kodak-gold-200',
      lighting: 'golden-hour',
      preservationStrength: 'strict',
      environmentEnhancement: 'moderate-realism-boost',
      creativeDirection: '',
      referenceHasPeople: false
    }
  },
  {
    id: 'famous-landmark-sparse-people',
    label: 'Famous landmark, sparse people',
    description:
      'Landmark-first preset that keeps occasional visitors present without turning the frame into a crowd.',
    values: {
      sceneCategory: 'tourist-landmark',
      peopleStrategy: 'keep',
      cameraPreset: 'canon-r5',
      lensPreset: '35mm-f1-4',
      captureStyle: 'editorial',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'kodak-portra-400',
      lighting: 'sunset-glow',
      preservationStrength: 'balanced',
      environmentEnhancement: 'moderate-realism-boost',
      creativeDirection:
        'Keep the landmark dominant and any visitors secondary, believable, and lightly distributed.',
      referenceHasPeople: true
    }
  },
  {
    id: 'city-square-blue-hour',
    label: 'City square, spread-out crowd',
    description:
      'Blue-hour city preset that keeps dispersed people believable while holding onto street-photography realism.',
    values: {
      sceneCategory: 'city-street-scene',
      peopleStrategy: 'keep',
      cameraPreset: 'leica-q3',
      lensPreset: '28mm-f2',
      captureStyle: 'street-photography',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'leica-natural',
      lighting: 'blue-hour',
      preservationStrength: 'balanced',
      environmentEnhancement: 'moderate-realism-boost',
      creativeDirection:
        'Keep the square lively and believable, with people reading as natural background city activity.',
      referenceHasPeople: true
    }
  },
  {
    id: 'mountain-viewpoint',
    label: 'Mountain viewpoint, no people',
    description:
      'Large-sensor landscape preset for empty mountain overlooks with calm morning realism.',
    values: {
      sceneCategory: 'mountain-hiking',
      peopleStrategy: 'remove',
      cameraPreset: 'fujifilm-gfx-100s',
      lensPreset: '45mm-equivalent-medium-format',
      captureStyle: 'fine-art-landscape',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'fujifilm-classic-chrome',
      lighting: 'soft-morning-light',
      preservationStrength: 'strict',
      environmentEnhancement: 'strong-realism-boost',
      creativeDirection: '',
      referenceHasPeople: false
    }
  },
  {
    id: 'couple-travel-photo',
    label: 'Couple travel photo',
    description:
      'Two-person golden-hour preset with premium travel-photo polish and realistic romantic atmosphere.',
    values: {
      sceneCategory: 'couple-friends-photo',
      peopleStrategy: 'keep',
      cameraPreset: 'sony-a7-iv',
      lensPreset: '50mm-f1-4',
      captureStyle: 'luxury-campaign',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'kodak-portra-400',
      lighting: 'golden-hour',
      preservationStrength: 'balanced',
      environmentEnhancement: 'moderate-realism-boost',
      creativeDirection:
        'Keep the pair natural, flattering, and integrated into the travel scene without turning the image into a staged ad.',
      referenceHasPeople: true
    }
  },
  {
    id: 'vintage-street-scene',
    label: 'Vintage street scene',
    description:
      'Analog street preset with a small group, soft overcast light, and restrained film character.',
    values: {
      sceneCategory: 'city-street-scene',
      peopleStrategy: 'keep',
      cameraPreset: 'leica-m6',
      lensPreset: '35mm-vintage-rangefinder',
      captureStyle: 'filmic-vintage',
      shotPerspective: 'match-reference-viewpoint',
      centerMainSubject: false,
      filterLook: 'kodak-tri-x-400',
      lighting: 'overcast-soft-light',
      preservationStrength: 'balanced',
      environmentEnhancement: 'minimal',
      creativeDirection:
        'Keep the people understated and naturally embedded in the street rhythm.',
      referenceHasPeople: true
    }
  }
]

export const CAMERA_PRESET_OPTIONS = CAMERA_PRESET_GROUPS.flatMap(
  (group) => group.options
)
export const LENS_PRESET_OPTIONS = LENS_PRESET_GROUPS.flatMap(
  (group) => group.options
)

function toOptionMap<TId extends string, TOption extends { id: TId }>(
  options: readonly TOption[]
): Record<TId, TOption> {
  return Object.fromEntries(
    options.map((option) => [option.id, option])
  ) as Record<TId, TOption>
}

export const SCENE_CATEGORY_MAP = toOptionMap(SCENE_CATEGORY_OPTIONS)
export const PEOPLE_STRATEGY_MAP = toOptionMap(PEOPLE_STRATEGY_OPTIONS)
export const PEOPLE_PRESENCE_MAP = toOptionMap(PEOPLE_PRESENCE_OPTIONS)
export const PEOPLE_HANDLING_MAP = toOptionMap(PEOPLE_HANDLING_OPTIONS)
export const CROWD_CHARACTER_MAP = toOptionMap(CROWD_CHARACTER_OPTIONS)
export const PRIMARY_SUBJECT_MAP = toOptionMap(PRIMARY_SUBJECT_OPTIONS)
export const CAMERA_PRESET_MAP = toOptionMap(CAMERA_PRESET_OPTIONS)
export const LENS_PRESET_MAP = toOptionMap(LENS_PRESET_OPTIONS)
export const CAPTURE_STYLE_MAP = toOptionMap(CAPTURE_STYLE_OPTIONS)
export const SHOT_PERSPECTIVE_MAP = toOptionMap(SHOT_PERSPECTIVE_OPTIONS)
export const FILTER_LOOK_MAP = toOptionMap(FILTER_LOOK_OPTIONS)
export const LIGHTING_MAP = toOptionMap(LIGHTING_OPTIONS)
export const PRESERVATION_STRENGTH_MAP = toOptionMap(
  PRESERVATION_STRENGTH_OPTIONS
)
export const ALLOWED_VARIATION_MAP = toOptionMap(ALLOWED_VARIATION_OPTIONS)
export const ENVIRONMENT_ENHANCEMENT_MAP = toOptionMap(
  ENVIRONMENT_ENHANCEMENT_OPTIONS
)
export const FLUX_MODEL_MAP = toOptionMap(FLUX_MODEL_OPTIONS)
export const FLUX_SAFETY_TOLERANCE_MAP = toOptionMap(
  FLUX_SAFETY_TOLERANCE_OPTIONS
)
export const PROMPT_PRESET_MAP = toOptionMap(PROMPT_PRESETS)

export function createFormStateFromPreset(
  presetId: PromptPreset['id'] = DEFAULT_PROMPT_PRESET_ID
): ImageRecreationFormState {
  const preset = PROMPT_PRESET_MAP[presetId]

  return {
    presetId,
    sceneCategory: preset.values.sceneCategory,
    referenceHasPeople: preset.values.referenceHasPeople ?? false,
    peopleStrategy: preset.values.peopleStrategy,
    peopleOverrideText: '',
    cameraPreset: preset.values.cameraPreset,
    lensPreset: preset.values.lensPreset,
    captureStyle: preset.values.captureStyle,
    shotPerspective: preset.values.shotPerspective,
    centerMainSubject: preset.values.centerMainSubject ?? false,
    filterLook: preset.values.filterLook,
    lighting: preset.values.lighting,
    preservationStrength: preset.values.preservationStrength,
    environmentEnhancement: preset.values.environmentEnhancement,
    modelId: 'flux-2-pro-preview',
    safetyTolerance: '2',
    enablePromptUpsampling: false,
    seedValue: '',
    creativeDirection: preset.values.creativeDirection ?? ''
  }
}

export const DEFAULT_IMAGE_RECREATION_FORM_STATE = createFormStateFromPreset()

export const VALID_SCENE_CATEGORY_IDS = new Set<SceneCategoryId>(
  SCENE_CATEGORY_OPTIONS.map((option) => option.id)
)
export const VALID_PEOPLE_STRATEGY_IDS = new Set<PeopleStrategyId>(
  PEOPLE_STRATEGY_OPTIONS.map((option) => option.id)
)
export const VALID_PEOPLE_PRESENCE_IDS = new Set<PeoplePresenceId>(
  PEOPLE_PRESENCE_OPTIONS.map((option) => option.id)
)
export const VALID_PEOPLE_HANDLING_IDS = new Set<PeopleHandlingId>(
  PEOPLE_HANDLING_OPTIONS.map((option) => option.id)
)
export const VALID_CROWD_CHARACTER_IDS = new Set<CrowdCharacterId>(
  CROWD_CHARACTER_OPTIONS.map((option) => option.id)
)
export const VALID_PRIMARY_SUBJECT_IDS = new Set<PrimarySubjectEmphasisId>(
  PRIMARY_SUBJECT_OPTIONS.map((option) => option.id)
)
export const VALID_CAMERA_PRESET_IDS = new Set<CameraPresetId>(
  CAMERA_PRESET_OPTIONS.map((option) => option.id)
)
export const VALID_LENS_PRESET_IDS = new Set<LensPresetId>(
  LENS_PRESET_OPTIONS.map((option) => option.id)
)
export const VALID_CAPTURE_STYLE_IDS = new Set<CaptureStyleId>(
  CAPTURE_STYLE_OPTIONS.map((option) => option.id)
)
export const VALID_SHOT_PERSPECTIVE_IDS = new Set<ShotPerspectiveId>(
  SHOT_PERSPECTIVE_OPTIONS.map((option) => option.id)
)
export const VALID_FILTER_LOOK_IDS = new Set<FilterLookId>(
  FILTER_LOOK_OPTIONS.map((option) => option.id)
)
export const VALID_LIGHTING_IDS = new Set<LightingId>(
  LIGHTING_OPTIONS.map((option) => option.id)
)
export const VALID_PRESERVATION_STRENGTH_IDS = new Set<PreservationStrengthId>(
  PRESERVATION_STRENGTH_OPTIONS.map((option) => option.id)
)
export const VALID_ALLOWED_VARIATION_IDS = new Set<AllowedVariationId>(
  ALLOWED_VARIATION_OPTIONS.map((option) => option.id)
)
export const VALID_ENVIRONMENT_ENHANCEMENT_IDS =
  new Set<EnvironmentEnhancementId>(
    ENVIRONMENT_ENHANCEMENT_OPTIONS.map((option) => option.id)
  )
export const VALID_FLUX_MODEL_IDS = new Set<FluxModelId>(
  FLUX_MODEL_OPTIONS.map((option) => option.id)
)
export const VALID_FLUX_SAFETY_TOLERANCE_IDS = new Set<FluxSafetyToleranceId>(
  FLUX_SAFETY_TOLERANCE_OPTIONS.map((option) => option.id)
)

export function isKnownPresetId(
  value: unknown
): value is ImageRecreationFormState['presetId'] {
  return (
    value === 'custom' ||
    (typeof value === 'string' && value in PROMPT_PRESET_MAP)
  )
}
