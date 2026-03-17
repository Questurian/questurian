import type {
  AllowedVariationId,
  AspectRatioId,
  CameraPresetId,
  CaptureStyleId,
  EnvironmentEnhancementId,
  FilterLookId,
  ImageRecreationFormState,
  LensPresetId,
  LightingId,
  OptionGroup,
  PeopleHandlingId,
  PeoplePresenceId,
  PreservationStrengthId,
  PrimarySubjectEmphasisId,
  PromptPreset,
  SceneCategoryId,
  SceneCategoryOption,
  SelectOption,
} from './types'

export const IMAGE_RECREATION_PROMPTS_STORAGE_KEY = 'image_recreation_prompts_form_v1'

export const DEFAULT_PROMPT_PRESET_ID = 'famous-landmark-no-people' as const

export const SCENE_CATEGORY_OPTIONS: SceneCategoryOption[] = [
  {
    id: 'landscape-only',
    label: 'Landscape only',
    description: 'Pure landscape scene with terrain, atmosphere, and scale leading the image.',
    prompt:
      'Preserve the image as a true landscape scene with terrain, atmosphere, scale, and natural spatial depth defining the frame.',
    helperText: 'Best when the frame is defined by landforms, open space, and atmosphere.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'scenic-viewpoint',
    label: 'Scenic viewpoint',
    description: 'Lookout or overlook image built around a strong viewing position.',
    prompt:
      'Preserve the viewpoint structure, the sense of elevation or overlook, and the original depth cues across the frame.',
    helperText: 'Useful for overlooks, terraces, and lookout points where the vista matters most.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'tourist-landmark',
    label: 'Tourist landmark',
    description: 'Landmark-driven travel photo without a built-in assumption about crowd density.',
    prompt:
      'Preserve the landmark as the defining scene category and keep the image rooted in a real travel context.',
    helperText: 'Use this when the landmark matters more than the people count.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'tourist-landmark-no-people',
    label: 'Tourist landmark with no people',
    description: 'Clean landmark image where the structure stays dominant and the scene remains empty.',
    prompt:
      'Preserve the landmark as the primary travel subject and keep the frame clean, calm, and visually unobstructed.',
    helperText: 'Best for empty plazas, clean landmark facades, and crowd-free travel frames.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'tourist-landmark-sparse-people',
    label: 'Tourist landmark with sparse people',
    description: 'Landmark-first image with only occasional visitors present in the scene.',
    prompt:
      'Preserve the landmark as the primary travel subject and keep the setting believable as a lightly visited tourist location.',
    helperText: 'Use for landmark scenes with only a few visitors or passersby.',
    recommendedPeoplePresence: 'small-group',
  },
  {
    id: 'tourist-landmark-crowd',
    label: 'Tourist landmark with crowd',
    description: 'Landmark image where crowd presence is part of the real setting.',
    prompt:
      'Preserve the landmark as the travel anchor while keeping the surrounding visitor activity grounded in the original scene.',
    helperText: 'Use when crowd density is part of the landmark image instead of a distraction.',
    recommendedPeoplePresence: 'spread-out-crowd',
  },
  {
    id: 'city-street-scene',
    label: 'City / street scene',
    description: 'Urban street or plaza image with architecture, public space, and street rhythm.',
    prompt:
      'Preserve the real urban layout, street depth, storefronts or facades, and the original public-space rhythm of the scene.',
    helperText: 'Best for plazas, street corners, walkways, and everyday city scenes.',
    recommendedPeoplePresence: 'small-group',
  },
  {
    id: 'architecture-exterior',
    label: 'Architecture exterior',
    description: 'Exterior architectural subject with lines, massing, and facade detail.',
    prompt:
      'Preserve the architecture, exterior geometry, facade materials, and the original structural proportions of the scene.',
    helperText: 'Use when buildings and exterior design details drive the image.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'architecture-interior',
    label: 'Architecture interior',
    description: 'Interior architectural scene focused on form, layout, light, and surfaces.',
    prompt:
      'Preserve the interior layout, architectural lines, material realism, and the original sense of volume and scale.',
    helperText: 'Best for lobbies, rooms, corridors, and designed interior spaces.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'portrait',
    label: 'Portrait',
    description: 'Single-person image where one existing human subject is central.',
    prompt:
      'Preserve the portrait framing, pose intent, and the original relationship between the person and the surrounding scene.',
    helperText: 'Use when one existing person clearly leads the frame.',
    recommendedPeoplePresence: 'one-person',
  },
  {
    id: 'couple-friends-photo',
    label: 'Couple / friends photo',
    description: 'Two-person travel or lifestyle image with a shared moment.',
    prompt:
      'Preserve the shared two-person dynamic, spatial relationship, and the original environment supporting the image.',
    helperText: 'Best for couple shots, friend travel photos, and paired subjects.',
    recommendedPeoplePresence: 'two-people',
  },
  {
    id: 'group-photo',
    label: 'Group photo',
    description: 'Small group composition where multiple people are intentionally included.',
    prompt:
      'Preserve the group-photo intent, the original group size, and the balance between people and surrounding context.',
    helperText: 'Use when a small group is intentionally posed or clearly central.',
    recommendedPeoplePresence: 'small-group',
  },
  {
    id: 'lifestyle-candid-people',
    label: 'Lifestyle / candid people',
    description: 'People-centered candid scene with natural, unforced activity.',
    prompt:
      'Preserve the candid human activity, the documentary feel of the moment, and the original environmental context.',
    helperText: 'Useful for lifestyle travel scenes with natural human activity.',
    recommendedPeoplePresence: 'small-group',
  },
  {
    id: 'product-object',
    label: 'Product / object',
    description: 'Object-driven scene where a product or standalone item is the key subject.',
    prompt:
      'Preserve the original object identity, product scale, supporting surfaces, and the scene setup around it.',
    helperText: 'Use when the image is built around a physical object or product.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'nature-wilderness',
    label: 'Nature / wilderness',
    description: 'Natural outdoor image focused on untamed terrain and atmosphere.',
    prompt:
      'Preserve the wilderness feel, terrain realism, atmospheric layering, and the unbuilt character of the environment.',
    helperText: 'Best for forests, valleys, meadows, and remote natural scenes.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'beach-coastal',
    label: 'Beach / coastal',
    description: 'Coastal scene shaped by shoreline, water, sky, and marine atmosphere.',
    prompt:
      'Preserve the shoreline geometry, water behavior, atmospheric haze, and the original coastal color relationships.',
    helperText: 'Use for beaches, coastlines, cliffs, and marine-edge views.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'mountain-hiking',
    label: 'Mountain / hiking',
    description: 'Mountain or hiking scene with elevation, terrain, and environmental scale.',
    prompt:
      'Preserve the mountain scale, trail or terrain structure, depth through the landscape, and the natural environmental hierarchy.',
    helperText: 'Best for alpine, trail, summit, and mountainous travel images.',
    recommendedPeoplePresence: 'no-people',
  },
  {
    id: 'desert-rock-formations',
    label: 'Desert / rock formations',
    description: 'Arid landscape with geological form, texture, and open light.',
    prompt:
      'Preserve the desert terrain, rock-form structure, atmospheric dryness, and the original geological character of the scene.',
    helperText: 'Use for dunes, canyons, mesas, arches, and other arid formations.',
    recommendedPeoplePresence: 'no-people',
  },
]

export const PEOPLE_PRESENCE_OPTIONS: SelectOption<PeoplePresenceId>[] = [
  {
    id: 'no-people',
    label: 'No people',
    description: 'The reference image contains no people at all.',
    prompt:
      'Preserve the image as a people-free scene and keep the frame entirely free of added human presence.',
  },
  {
    id: 'one-person',
    label: 'One person',
    description: 'Exactly one existing person is present in the scene.',
    prompt:
      'Preserve exactly one existing person as part of the original scene without changing who the subject is.',
  },
  {
    id: 'two-people',
    label: 'Two people',
    description: 'Exactly two existing people are present in the scene.',
    prompt:
      'Preserve exactly two existing people as the authentic human subjects already present in the reference image.',
  },
  {
    id: 'small-group',
    label: 'Small group',
    description: 'A handful of people are present without becoming a crowd.',
    prompt:
      'Preserve the small group of existing people without expanding the scene into a larger crowd or collapsing it into fewer subjects.',
  },
  {
    id: 'spread-out-crowd',
    label: 'Spread-out crowd',
    description: 'People are dispersed across the frame but are not packed tightly together.',
    prompt:
      'Preserve dispersed people across the scene as part of the real setting while keeping the environment or landmark dominant.',
  },
  {
    id: 'dense-crowd',
    label: 'Dense crowd',
    description: 'Crowd density is a defining part of the original scene.',
    prompt:
      'Preserve the dense crowd as part of the real scene without turning background people into exaggerated foreground characters.',
  },
]

export const PEOPLE_HANDLING_OPTIONS: SelectOption<PeopleHandlingId>[] = [
  {
    id: 'preserve-exactly',
    label: 'Preserve exactly',
    description: 'Keep people tightly anchored to the original image.',
    prompt:
      'Preserve the existing people exactly as they appear in the reference image, including count, scene role, and general placement.',
  },
  {
    id: 'preserve-count-minor-natural-changes',
    label: 'Preserve count, allow minor natural changes',
    description: 'Keep the count fixed but allow only tiny natural micro-variation.',
    prompt:
      'Preserve the original people count while allowing only minor natural micro-variation for those same existing people.',
  },
  {
    id: 'preserve-scene-subtle-reshuffling',
    label: 'Preserve scene, allow subtle reshuffling only for existing people',
    description: 'Allow only restrained repositioning of people who already exist in frame.',
    prompt:
      'Preserve the same scene and the same people count while allowing only subtle reshuffling of existing people within plausible positions.',
  },
  {
    id: 'keep-people-secondary',
    label: 'Keep people secondary to environment',
    description: 'People stay present but should not dominate the image.',
    prompt:
      'Keep existing people secondary to the environment so they support the scene without overtaking the frame.',
  },
  {
    id: 'keep-environment-primary',
    label: 'Keep landmark / environment as primary focus',
    description: 'The place remains primary even if people are visible.',
    prompt:
      'Keep the landmark or environment as the primary focus even when existing people remain in the scene.',
  },
]

export const PRIMARY_SUBJECT_OPTIONS: SelectOption<PrimarySubjectEmphasisId>[] = [
  {
    id: 'environment-first',
    label: 'Environment first',
    description: 'Terrain, architecture, or place should lead the frame.',
    prompt:
      'Keep the environment, spatial atmosphere, and scene structure as the primary focus of the final photograph.',
  },
  {
    id: 'landmark-first',
    label: 'Landmark first',
    description: 'The landmark should remain the main focal subject.',
    prompt:
      'Keep the landmark or defining destination feature as the primary focal subject of the image.',
  },
  {
    id: 'person-first',
    label: 'Person first',
    description: 'Existing people lead the frame without changing who is present.',
    prompt:
      'Keep the existing person or people as the primary focal subjects without changing who is present or increasing their number.',
  },
  {
    id: 'balanced-scene',
    label: 'Balanced scene',
    description: 'Maintain the relationship between subject and environment.',
    prompt:
      'Maintain a balanced relationship between the main subject and the environment, matching the reference image intent.',
  },
]

export const CAMERA_PRESET_GROUPS: OptionGroup<CameraPresetId>[] = [
  {
    label: 'Modern digital',
    options: [
      {
        id: 'sony-a7r-v',
        label: 'Sony A7R V',
        description: 'High-resolution modern full-frame rendering with refined detail.',
        prompt:
          'Use crisp modern full-frame rendering, broad dynamic range, and clean high-resolution photographic detail.',
      },
      {
        id: 'sony-a7-iv',
        label: 'Sony A7 IV',
        description: 'Balanced full-frame travel camera rendering.',
        prompt:
          'Use balanced full-frame realism with strong dynamic range, natural contrast, and dependable travel-photo clarity.',
      },
      {
        id: 'sony-a1',
        label: 'Sony A1',
        description: 'Premium flagship digital clarity and speed.',
        prompt:
          'Use flagship-level digital clarity, controlled highlight handling, and premium modern image fidelity.',
      },
      {
        id: 'canon-r5',
        label: 'Canon R5',
        description: 'Clean high-detail output with polished color.',
        prompt:
          'Use high-detail modern digital capture with polished color, realistic contrast, and confident full-frame sharpness.',
      },
      {
        id: 'canon-r6-mark-ii',
        label: 'Canon R6 Mark II',
        description: 'Natural, flexible full-frame travel rendering.',
        prompt:
          'Use natural modern full-frame rendering with soft but realistic tonal transitions and dependable real-world color.',
      },
      {
        id: 'nikon-z8',
        label: 'Nikon Z8',
        description: 'Detailed, high-contrast flagship mirrorless rendering.',
        prompt:
          'Use detailed modern capture with strong dynamic range, clean tonal separation, and grounded high-end realism.',
      },
      {
        id: 'nikon-zf',
        label: 'Nikon Zf',
        description: 'Modern digital capture with a subtly classic tonal feel.',
        prompt:
          'Use modern digital fidelity with a slightly classic tonal feel, restrained contrast, and realistic texture handling.',
      },
      {
        id: 'fujifilm-gfx-100s',
        label: 'Fujifilm GFX 100S',
        description: 'Large-format-style digital rendering with depth and tonal richness.',
        prompt:
          'Use large-sensor realism with rich tonal depth, refined texture, and the calm precision of medium-format capture.',
      },
      {
        id: 'fujifilm-x100vi',
        label: 'Fujifilm X100VI',
        description: 'Compact reportage camera feel with polished color.',
        prompt:
          'Use compact reportage realism with natural color depth, restrained sharpness, and an intentional street-photography feel.',
      },
      {
        id: 'leica-q3',
        label: 'Leica Q3',
        description: 'Crisp premium reportage look with refined micro-contrast.',
        prompt:
          'Use premium reportage rendering with refined micro-contrast, clean edge definition, and believable full-frame depth.',
      },
    ],
  },
  {
    label: 'Film / retro / vintage inspired',
    options: [
      {
        id: 'contax-t2',
        label: 'Contax T2',
        description: 'Compact premium film-camera character with polished analog charm.',
        prompt:
          'Use premium compact-film character with soft analog texture, natural grain, and elegant highlight rolloff.',
      },
      {
        id: 'leica-m6',
        label: 'Leica M6',
        description: 'Classic rangefinder film rendering with understated analog texture.',
        prompt:
          'Use classic rangefinder-film character with organic contrast, gentle grain, and believable analog realism.',
      },
      {
        id: 'hasselblad-500cm',
        label: 'Hasselblad 500CM',
        description: 'Medium-format film depth and composed analog tonality.',
        prompt:
          'Use medium-format analog rendering with rich tonal separation, measured detail, and elegant film depth.',
      },
      {
        id: 'mamiya-7',
        label: 'Mamiya 7',
        description: 'Clean medium-format travel rendering with film character.',
        prompt:
          'Use medium-format travel-film character with open tonal range, realistic texture, and composed analog clarity.',
      },
      {
        id: 'pentax-67',
        label: 'Pentax 67',
        description: 'Large medium-format film rendering with depth and presence.',
        prompt:
          'Use large medium-format film character with dimensional depth, soft rolloff, and tactile analog texture.',
      },
      {
        id: 'canon-ae-1',
        label: 'Canon AE-1',
        description: 'Classic 35mm SLR film character.',
        prompt:
          'Use classic 35mm SLR film realism with subtle grain, grounded color, and lightly imperfect analog character.',
      },
      {
        id: 'nikon-fm2',
        label: 'Nikon FM2',
        description: 'Mechanical 35mm film look with straightforward analog clarity.',
        prompt:
          'Use straightforward 35mm film realism with crisp analog texture, believable contrast, and restrained grain.',
      },
      {
        id: 'polaroid-sx-70',
        label: 'Polaroid SX-70',
        description: 'Instant-film softness with vintage bloom and nostalgia.',
        prompt:
          'Use instant-film character with gentle softness, blooming highlights, muted contrast, and honest analog imperfection.',
      },
    ],
  },
]

export const LENS_PRESET_GROUPS: OptionGroup<LensPresetId>[] = [
  {
    label: 'Modern lenses',
    options: [
      {
        id: '24mm-f1-4',
        label: '24mm f/1.4',
        description: 'Wide fast prime for immersive environmental perspective.',
        prompt:
          'Use wide-angle environmental perspective with strong spatial depth, realistic edge behavior, and immersive scene coverage.',
      },
      {
        id: '28mm-f2',
        label: '28mm f/2',
        description: 'Balanced wide reportage perspective.',
        prompt:
          'Use a balanced wide reportage perspective with natural subject-environment relationships and believable edge rendering.',
      },
      {
        id: '35mm-f1-8',
        label: '35mm f/1.8',
        description: 'Flexible documentary focal length with soft depth options.',
        prompt:
          'Use natural documentary perspective with realistic depth, restrained separation, and dependable subject framing.',
      },
      {
        id: '35mm-f1-4',
        label: '35mm f/1.4',
        description: 'Classic storytelling focal length with premium depth control.',
        prompt:
          'Use classic storytelling perspective with shallow-but-believable depth, natural subject presence, and clean optical rendering.',
      },
      {
        id: '50mm-f1-4',
        label: '50mm f/1.4',
        description: 'Natural normal perspective with strong subject separation.',
        prompt:
          'Use natural normal-lens perspective with believable subject separation, realistic facial proportions, and refined focus falloff.',
      },
      {
        id: '50mm-f1-8',
        label: '50mm f/1.8',
        description: 'Straightforward normal prime with clean realism.',
        prompt:
          'Use natural normal-lens perspective with clean rendering, practical depth, and restrained photographic realism.',
      },
      {
        id: '85mm-f1-8',
        label: '85mm f/1.8',
        description: 'Portrait-oriented telephoto perspective.',
        prompt:
          'Use flattering short-telephoto compression with realistic subject separation and natural spatial layering.',
      },
      {
        id: '70-200mm-f2-8',
        label: '70-200mm f/2.8',
        description: 'Compressed telephoto perspective with selective subject isolation.',
        prompt:
          'Use telephoto compression with controlled background separation, realistic perspective flattening, and premium long-lens detail.',
      },
      {
        id: '24-70mm-f2-8',
        label: '24-70mm f/2.8',
        description: 'Versatile zoom rendering for editorial travel realism.',
        prompt:
          'Use versatile pro-zoom rendering with realistic depth, dependable sharpness, and practical editorial framing.',
      },
      {
        id: '16-35mm-f2-8',
        label: '16-35mm f/2.8',
        description: 'Ultra-wide environmental coverage for architecture and landscapes.',
        prompt:
          'Use ultra-wide environmental coverage with believable geometry, strong depth cues, and realistic wide-angle optics.',
      },
    ],
  },
  {
    label: 'Vintage / character lenses',
    options: [
      {
        id: '35mm-vintage-rangefinder',
        label: '35mm vintage rangefinder lens',
        description: 'Classic rangefinder perspective with gentle analog character.',
        prompt:
          'Use classic rangefinder perspective with gentle edge softness, organic contrast, and believable vintage optical character.',
      },
      {
        id: '50mm-vintage-fast-prime',
        label: '50mm vintage fast prime',
        description: 'Normal vintage prime with softer contrast and analog glow.',
        prompt:
          'Use a vintage normal-prime look with softer contrast, subtle glow, and organic analog depth.',
      },
      {
        id: '85mm-vintage-portrait',
        label: '85mm vintage portrait lens',
        description: 'Portrait telephoto with classic analog softness.',
        prompt:
          'Use vintage portrait-lens compression with soft highlight rolloff, flattering depth, and natural analog rendering.',
      },
      {
        id: 'soft-vintage-film-lens',
        label: 'soft vintage film lens',
        description: 'Dreamier vintage optical behavior while staying realistic.',
        prompt:
          'Use gentle vintage softness, mild blooming highlights, and analog imperfection while keeping the scene believable and photographic.',
      },
      {
        id: 'classic-medium-format-rendering',
        label: 'classic medium format lens rendering',
        description: 'Calm medium-format character with dimensional depth.',
        prompt:
          'Use classic medium-format lens character with dimensional depth, measured falloff, and refined analog realism.',
      },
      {
        id: '45mm-equivalent-medium-format',
        label: '45mm equivalent medium format lens',
        description: 'Balanced medium-format-equivalent field of view for landscapes and viewpoints.',
        prompt:
          'Use a balanced medium-format-equivalent field of view with calm perspective, rich depth, and refined optical realism.',
      },
    ],
  },
]

export const CAPTURE_STYLE_OPTIONS: SelectOption<CaptureStyleId>[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Polished publication-ready realism with controlled styling.',
    prompt:
      'Keep the result polished and publication-ready with refined composition and restrained editorial finish.',
  },
  {
    id: 'natural-documentary',
    label: 'Natural documentary',
    description: 'Grounded documentary realism with minimal artifice.',
    prompt:
      'Keep the result grounded, observational, and documentary in feel, with realism taking priority over stylization.',
  },
  {
    id: 'luxury-campaign',
    label: 'Luxury campaign',
    description: 'Premium commercial polish that still feels camera-real.',
    prompt:
      'Keep the result premium and aspirational with a luxury-travel polish that still feels like a real camera photograph.',
  },
  {
    id: 'travel-photography',
    label: 'Travel photography',
    description: 'Real-world destination photography with strong scene fidelity.',
    prompt:
      'Keep the result grounded in believable destination photography with clear place identity and realistic scene fidelity.',
  },
  {
    id: 'street-photography',
    label: 'Street photography',
    description: 'Reportage-style realism with public-space energy.',
    prompt:
      'Keep the result rooted in authentic street-photography energy with believable public-space timing and observation.',
  },
  {
    id: 'fine-art-landscape',
    label: 'Fine art landscape',
    description: 'Refined landscape treatment without losing realism.',
    prompt:
      'Keep the result refined and atmospheric with fine-art landscape restraint while staying true to natural realism.',
  },
  {
    id: 'filmic-vintage',
    label: 'Filmic vintage',
    description: 'Analog-inspired styling with restrained nostalgic character.',
    prompt:
      'Keep the result filmic and vintage-inspired with analog character, but still physically believable and photographic.',
  },
  {
    id: 'real-estate-architecture-clean',
    label: 'Real estate / architecture clean',
    description: 'Clean architecture-driven rendering with corrected realism.',
    prompt:
      'Keep the result clean, precise, and architecture-forward with realistic surfaces, lines, and well-controlled detail.',
  },
  {
    id: 'casual-candid',
    label: 'Casual candid',
    description: 'Relaxed natural image without heavy polish.',
    prompt:
      'Keep the result relaxed and candid with natural imperfections, everyday realism, and no over-staging.',
  },
]

export const ASPECT_RATIO_OPTIONS: SelectOption<AspectRatioId>[] = [
  {
    id: 'match-reference',
    label: 'Match reference image',
    description: 'Preserve the source image ratio and framing boundaries.',
    prompt:
      'Preserve the original aspect ratio and the original framing boundaries of the reference image.',
  },
  {
    id: '1-1-square',
    label: '1:1 square',
    description: 'Square output with restrained reframing.',
    prompt:
      'Render the final image in a 1:1 square frame while keeping the reference image as the composition base and using only minimal reframing.',
  },
  {
    id: '4-5-portrait',
    label: '4:5 portrait',
    description: 'Tall portrait crop common for editorial and social formats.',
    prompt:
      'Render the final image in a 4:5 portrait frame while keeping the main subject placement and scene identity faithful to the reference image.',
  },
  {
    id: '3-4-portrait',
    label: '3:4 portrait',
    description: 'Balanced portrait-oriented output.',
    prompt:
      'Render the final image in a 3:4 portrait frame while preserving the original composition intent as closely as possible.',
  },
  {
    id: '2-3-portrait',
    label: '2:3 portrait',
    description: 'Classic portrait photo ratio.',
    prompt:
      'Render the final image in a 2:3 portrait frame while preserving subject placement, scene hierarchy, and composition intent.',
  },
  {
    id: '3-2-landscape',
    label: '3:2 landscape',
    description: 'Classic horizontal photo ratio.',
    prompt:
      'Render the final image in a 3:2 landscape frame while preserving the original composition anchor and scene structure.',
  },
  {
    id: '4-3-landscape',
    label: '4:3 landscape',
    description: 'Balanced horizontal output with slightly taller framing.',
    prompt:
      'Render the final image in a 4:3 landscape frame while keeping the original scene balance and focal hierarchy intact.',
  },
  {
    id: '16-9-widescreen',
    label: '16:9 widescreen',
    description: 'Wide cinematic frame with minimal compositional expansion.',
    prompt:
      'Render the final image in a 16:9 widescreen frame while keeping the reference composition dominant and using only restrained reframing.',
  },
  {
    id: '9-16-vertical',
    label: '9:16 vertical',
    description: 'Tall vertical frame for story-style output.',
    prompt:
      'Render the final image in a 9:16 vertical frame while keeping the original subject anchor and composition intent recognizable.',
  },
]

export const FILTER_LOOK_OPTIONS: SelectOption<FilterLookId>[] = [
  {
    id: 'neutral-no-filter',
    label: 'Neutral / no filter',
    description: 'Clean natural color without an obvious applied filter treatment.',
    prompt:
      'Keep the color treatment neutral and photographic, with no obvious applied social-media filter look.',
  },
  {
    id: 'iphone-natural',
    label: 'iPhone natural',
    description: 'Familiar modern smartphone look with clean color and approachable contrast.',
    prompt:
      'Use a modern iPhone-like natural look with clean color, approachable contrast, and realistic everyday travel-photo rendering.',
  },
  {
    id: 'iphone-vivid',
    label: 'iPhone vivid',
    description: 'Popular punchier smartphone look with brighter color and contrast.',
    prompt:
      'Use an iPhone-like vivid look with slightly stronger color and contrast, while keeping skin, sky, and environmental detail realistic and controlled.',
  },
  {
    id: 'fujifilm-classic-chrome',
    label: 'Fujifilm Classic Chrome',
    description: 'Well-known travel/editorial palette with muted saturation and refined contrast.',
    prompt:
      'Use a Classic Chrome-inspired travel/editorial palette with muted saturation, refined contrast, and subdued but believable color separation.',
  },
  {
    id: 'kodak-portra-400',
    label: 'Kodak Portra 400',
    description: 'Popular editorial film look with warm natural skin and soft color rolloff.',
    prompt:
      'Use a Portra 400-inspired editorial film palette with warm natural color, soft highlight rolloff, and restrained analog richness.',
  },
  {
    id: 'kodak-gold-200',
    label: 'Kodak Gold 200',
    description: 'Recognizable warm travel-film look with sunny nostalgic color.',
    prompt:
      'Use a Kodak Gold-inspired travel look with warm sunlit color, gentle nostalgic richness, and believable film-style warmth.',
  },
  {
    id: 'leica-natural',
    label: 'Leica natural',
    description: 'Well-known premium reportage look with restrained color and micro-contrast.',
    prompt:
      'Use a Leica-like natural reportage color treatment with restrained saturation, refined micro-contrast, and polished editorial realism.',
  },
]

export const LIGHTING_OPTIONS: SelectOption<LightingId>[] = [
  {
    id: 'clear-bright-midday-sun',
    label: 'Clear bright midday sun',
    description: 'Bright daylight with clean visibility and crisp shadows.',
    prompt:
      'Use clean blue sky daylight, crisp shadows, high visibility, and natural midday clarity.',
  },
  {
    id: 'soft-morning-light',
    label: 'Soft morning light',
    description: 'Gentle early-daylight illumination with soft contrast.',
    prompt:
      'Use soft early-daylight illumination, fresh atmosphere, gentle contrast, and believable morning clarity.',
  },
  {
    id: 'golden-hour',
    label: 'Golden hour',
    description: 'Warm low-angle sunlight with long soft shadows.',
    prompt:
      'Use warm low-angle sunlight, long soft shadows, and rich but realistic color.',
  },
  {
    id: 'sunset-glow',
    label: 'Sunset glow',
    description: 'Warm sunset atmosphere with realistic haze and color.',
    prompt:
      'Use a photogenic sunset sky, warm atmosphere, realistic haze, and cinematic but believable light.',
  },
  {
    id: 'blue-hour',
    label: 'Blue hour',
    description: 'Cool dusk ambience with subtle natural glow.',
    prompt:
      'Use cool ambient dusk light, subtle glow, and a natural blue-hour atmosphere.',
  },
  {
    id: 'overcast-soft-light',
    label: 'Overcast soft light',
    description: 'Soft diffused daylight with muted highlights.',
    prompt:
      'Use soft diffused light, gentle contrast, realistic cloud cover, and muted highlights.',
  },
  {
    id: 'diffused-cloudy-daylight',
    label: 'Diffused cloudy daylight',
    description: 'Cloud-filtered daylight with even tonal balance.',
    prompt:
      'Use evenly diffused cloudy daylight, calm tonal balance, and realistic subdued brightness.',
  },
  {
    id: 'dramatic-storm-light',
    label: 'Dramatic storm light',
    description: 'Moody cloud cover with selective light and tension.',
    prompt:
      'Use heavy cloud mood, selective sunlight, and realistic atmospheric tension.',
  },
  {
    id: 'hazy-afternoon-light',
    label: 'Hazy afternoon light',
    description: 'Bright afternoon light softened by haze or moisture.',
    prompt:
      'Use hazy afternoon brightness, softened distance detail, and believable atmospheric diffusion.',
  },
  {
    id: 'backlit-sunlight',
    label: 'Backlit sunlight',
    description: 'Sunlit backlight with controlled flare and rim effects.',
    prompt:
      'Use realistic backlit sunlight with controlled flare, believable rim light, and preserved scene detail.',
  },
  {
    id: 'window-light',
    label: 'Window light',
    description: 'Natural indoor light entering through windows.',
    prompt:
      'Use natural window light with believable interior falloff, gentle shadowing, and realistic directional softness.',
  },
  {
    id: 'night-city-lights',
    label: 'Night city lights',
    description: 'Urban night exposure driven by practical lights.',
    prompt:
      'Use realistic urban night exposure, practical lights, controlled highlights, and believable darkness.',
  },
  {
    id: 'mixed-urban-lighting',
    label: 'Mixed urban lighting',
    description: 'Layered city lighting from signage, streetlights, and ambient sources.',
    prompt:
      'Use layered city lighting from practical sources with realistic color contrast and controlled highlight spill.',
  },
  {
    id: 'flat-neutral-daylight',
    label: 'Flat neutral daylight',
    description: 'Low-drama daylight with minimal contrast.',
    prompt:
      'Use flat neutral daylight with restrained contrast, accurate color, and an honest low-drama photographic feel.',
  },
]

export const PRESERVATION_STRENGTH_OPTIONS: SelectOption<PreservationStrengthId>[] = [
  {
    id: 'strict',
    label: 'Strict',
    description: 'Preserve the scene very closely.',
    prompt:
      'Preserve the scene structure, subject count, composition intent, and major elements very closely.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Preserve the core image while allowing subtle natural variation.',
    prompt:
      'Preserve the core image faithfully while allowing subtle natural variation that does not change the image identity.',
  },
  {
    id: 'flexible',
    label: 'Flexible',
    description: 'Allow restrained reinterpretation while keeping the scene category intact.',
    prompt:
      'Preserve the scene category and core subject while allowing restrained reinterpretation of minor details.',
  },
]

export const ALLOWED_VARIATION_OPTIONS: SelectOption<AllowedVariationId>[] = [
  {
    id: 'no-variation',
    label: 'No variation',
    description: 'Stay as faithful to the original image as possible.',
    prompt: 'Allow no variation beyond faithful realism cleanup.',
  },
  {
    id: 'small-environmental-cleanup',
    label: 'Small environmental cleanup only',
    description: 'Permit only very minor cleanup of distractions already in the scene.',
    prompt:
      'Limit changes to small environmental cleanup only, such as reducing minor distractions or visual noise without altering existing subjects.',
  },
  {
    id: 'small-wardrobe-changes',
    label: 'Small wardrobe changes for existing people only',
    description: 'Permit only tiny clothing adjustments for people already present.',
    prompt:
      'Allow only small wardrobe-detail changes for people already present, without changing identity, count, or the scene role of those people.',
  },
  {
    id: 'small-positional-shifts',
    label: 'Small positional shifts for existing people only',
    description: 'Permit only subtle repositioning of existing people.',
    prompt:
      'Allow only small positional shifts for people already present, without changing subject count or creating new focal subjects.',
  },
  {
    id: 'minor-secondary-detail-changes',
    label: 'Minor secondary detail changes only',
    description: 'Permit only restrained changes to minor secondary details.',
    prompt:
      'Allow only minor changes to secondary details while keeping the core composition, subject count, and scene identity intact.',
  },
]

export const ENVIRONMENT_ENHANCEMENT_OPTIONS: SelectOption<EnvironmentEnhancementId>[] = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Use restrained realism cleanup only.',
    prompt:
      'Apply only restrained realism cleanup with subtle improvements to atmospheric perspective, shadow behavior, and color fidelity.',
  },
  {
    id: 'moderate-realism-boost',
    label: 'Moderate realism boost',
    description: 'Improve realism clearly without pushing the image too far.',
    prompt:
      'Moderately boost realism in the sky, atmosphere, terrain or architecture detail, shadow behavior, color depth, and light falloff while staying faithful to the original scene.',
  },
  {
    id: 'strong-realism-boost',
    label: 'Strong realism boost',
    description: 'Push realism harder while keeping the scene itself intact.',
    prompt:
      'Strongly enhance realism in atmospheric perspective, haze layering, terrain or building detail, sky fidelity, shadow behavior, color depth, and optical light falloff while keeping the underlying scene intact.',
  },
]

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'famous-landmark-no-people',
    label: 'Famous landmark, no people',
    description:
      'Strict landmark-preservation preset with clean midday travel-photo realism and no added tourists.',
    values: {
      sceneCategory: 'tourist-landmark-no-people',
      peoplePresence: 'no-people',
      peopleHandling: 'preserve-exactly',
      primarySubjectEmphasis: 'landmark-first',
      cameraPreset: 'sony-a7r-v',
      lensPreset: '24mm-f1-4',
      captureStyle: 'travel-photography',
      aspectRatio: 'match-reference',
      filterLook: 'neutral-no-filter',
      lighting: 'clear-bright-midday-sun',
      preservationStrength: 'strict',
      allowedVariation: 'no-variation',
      environmentEnhancement: 'moderate-realism-boost',
    },
  },
  {
    id: 'desert-landscape-editorial',
    label: 'Desert landscape, no people',
    description:
      'Golden-hour desert preset for empty terrain, editorial polish, and strong geological realism.',
    values: {
      sceneCategory: 'desert-rock-formations',
      peoplePresence: 'no-people',
      peopleHandling: 'preserve-exactly',
      primarySubjectEmphasis: 'environment-first',
      cameraPreset: 'sony-a7r-v',
      lensPreset: '35mm-f1-8',
      captureStyle: 'editorial',
      aspectRatio: 'match-reference',
      filterLook: 'kodak-gold-200',
      lighting: 'golden-hour',
      preservationStrength: 'strict',
      allowedVariation: 'no-variation',
      environmentEnhancement: 'moderate-realism-boost',
    },
  },
  {
    id: 'famous-landmark-sparse-people',
    label: 'Famous landmark, sparse people',
    description:
      'Landmark-first preset that keeps occasional visitors present without turning the frame into a crowd.',
    values: {
      sceneCategory: 'tourist-landmark-sparse-people',
      peoplePresence: 'small-group',
      peopleHandling: 'keep-environment-primary',
      primarySubjectEmphasis: 'landmark-first',
      cameraPreset: 'canon-r5',
      lensPreset: '35mm-f1-4',
      captureStyle: 'editorial',
      aspectRatio: 'match-reference',
      filterLook: 'kodak-portra-400',
      lighting: 'sunset-glow',
      preservationStrength: 'balanced',
      allowedVariation: 'small-positional-shifts',
      environmentEnhancement: 'moderate-realism-boost',
    },
  },
  {
    id: 'city-square-blue-hour',
    label: 'City square, spread-out crowd',
    description:
      'Blue-hour city preset that keeps dispersed people believable while holding onto street-photography realism.',
    values: {
      sceneCategory: 'city-street-scene',
      peoplePresence: 'spread-out-crowd',
      peopleHandling: 'keep-people-secondary',
      primarySubjectEmphasis: 'balanced-scene',
      cameraPreset: 'leica-q3',
      lensPreset: '28mm-f2',
      captureStyle: 'street-photography',
      aspectRatio: 'match-reference',
      filterLook: 'leica-natural',
      lighting: 'blue-hour',
      preservationStrength: 'balanced',
      allowedVariation: 'minor-secondary-detail-changes',
      environmentEnhancement: 'moderate-realism-boost',
    },
  },
  {
    id: 'mountain-viewpoint',
    label: 'Mountain viewpoint, no people',
    description:
      'Large-sensor landscape preset for empty mountain overlooks with calm morning realism.',
    values: {
      sceneCategory: 'mountain-hiking',
      peoplePresence: 'no-people',
      peopleHandling: 'preserve-exactly',
      primarySubjectEmphasis: 'environment-first',
      cameraPreset: 'fujifilm-gfx-100s',
      lensPreset: '45mm-equivalent-medium-format',
      captureStyle: 'fine-art-landscape',
      aspectRatio: 'match-reference',
      filterLook: 'fujifilm-classic-chrome',
      lighting: 'soft-morning-light',
      preservationStrength: 'strict',
      allowedVariation: 'no-variation',
      environmentEnhancement: 'strong-realism-boost',
    },
  },
  {
    id: 'couple-travel-photo',
    label: 'Couple travel photo',
    description:
      'Two-person golden-hour preset with premium travel-photo polish and realistic romantic atmosphere.',
    values: {
      sceneCategory: 'couple-friends-photo',
      peoplePresence: 'two-people',
      peopleHandling: 'preserve-count-minor-natural-changes',
      primarySubjectEmphasis: 'person-first',
      cameraPreset: 'sony-a7-iv',
      lensPreset: '50mm-f1-4',
      captureStyle: 'luxury-campaign',
      aspectRatio: 'match-reference',
      filterLook: 'kodak-portra-400',
      lighting: 'golden-hour',
      preservationStrength: 'balanced',
      allowedVariation: 'small-wardrobe-changes',
      environmentEnhancement: 'moderate-realism-boost',
    },
  },
  {
    id: 'vintage-street-scene',
    label: 'Vintage street scene',
    description:
      'Analog street preset with a small group, soft overcast light, and restrained film character.',
    values: {
      sceneCategory: 'city-street-scene',
      peoplePresence: 'small-group',
      peopleHandling: 'keep-people-secondary',
      primarySubjectEmphasis: 'balanced-scene',
      cameraPreset: 'leica-m6',
      lensPreset: '35mm-vintage-rangefinder',
      captureStyle: 'filmic-vintage',
      aspectRatio: 'match-reference',
      filterLook: 'fujifilm-classic-chrome',
      lighting: 'overcast-soft-light',
      preservationStrength: 'balanced',
      allowedVariation: 'minor-secondary-detail-changes',
      environmentEnhancement: 'minimal',
    },
  },
]

export const CAMERA_PRESET_OPTIONS = CAMERA_PRESET_GROUPS.flatMap((group) => group.options)
export const LENS_PRESET_OPTIONS = LENS_PRESET_GROUPS.flatMap((group) => group.options)

function toOptionMap<TId extends string, TOption extends { id: TId }>(
  options: readonly TOption[],
): Record<TId, TOption> {
  return Object.fromEntries(options.map((option) => [option.id, option])) as Record<TId, TOption>
}

export const SCENE_CATEGORY_MAP = toOptionMap(SCENE_CATEGORY_OPTIONS)
export const PEOPLE_PRESENCE_MAP = toOptionMap(PEOPLE_PRESENCE_OPTIONS)
export const PEOPLE_HANDLING_MAP = toOptionMap(PEOPLE_HANDLING_OPTIONS)
export const PRIMARY_SUBJECT_MAP = toOptionMap(PRIMARY_SUBJECT_OPTIONS)
export const CAMERA_PRESET_MAP = toOptionMap(CAMERA_PRESET_OPTIONS)
export const LENS_PRESET_MAP = toOptionMap(LENS_PRESET_OPTIONS)
export const CAPTURE_STYLE_MAP = toOptionMap(CAPTURE_STYLE_OPTIONS)
export const ASPECT_RATIO_MAP = toOptionMap(ASPECT_RATIO_OPTIONS)
export const FILTER_LOOK_MAP = toOptionMap(FILTER_LOOK_OPTIONS)
export const LIGHTING_MAP = toOptionMap(LIGHTING_OPTIONS)
export const PRESERVATION_STRENGTH_MAP = toOptionMap(PRESERVATION_STRENGTH_OPTIONS)
export const ALLOWED_VARIATION_MAP = toOptionMap(ALLOWED_VARIATION_OPTIONS)
export const ENVIRONMENT_ENHANCEMENT_MAP = toOptionMap(ENVIRONMENT_ENHANCEMENT_OPTIONS)
export const PROMPT_PRESET_MAP = toOptionMap(PROMPT_PRESETS)

export function createFormStateFromPreset(
  presetId: PromptPreset['id'] = DEFAULT_PROMPT_PRESET_ID,
): ImageRecreationFormState {
  const preset = PROMPT_PRESET_MAP[presetId]

  return {
    presetId,
    extraInstructions: preset.values.extraInstructions ?? '',
    ...preset.values,
  }
}

export const DEFAULT_IMAGE_RECREATION_FORM_STATE = createFormStateFromPreset()

export const VALID_SCENE_CATEGORY_IDS = new Set<SceneCategoryId>(
  SCENE_CATEGORY_OPTIONS.map((option) => option.id),
)
export const VALID_PEOPLE_PRESENCE_IDS = new Set<PeoplePresenceId>(
  PEOPLE_PRESENCE_OPTIONS.map((option) => option.id),
)
export const VALID_PEOPLE_HANDLING_IDS = new Set<PeopleHandlingId>(
  PEOPLE_HANDLING_OPTIONS.map((option) => option.id),
)
export const VALID_PRIMARY_SUBJECT_IDS = new Set<PrimarySubjectEmphasisId>(
  PRIMARY_SUBJECT_OPTIONS.map((option) => option.id),
)
export const VALID_CAMERA_PRESET_IDS = new Set<CameraPresetId>(
  CAMERA_PRESET_OPTIONS.map((option) => option.id),
)
export const VALID_LENS_PRESET_IDS = new Set<LensPresetId>(
  LENS_PRESET_OPTIONS.map((option) => option.id),
)
export const VALID_CAPTURE_STYLE_IDS = new Set<CaptureStyleId>(
  CAPTURE_STYLE_OPTIONS.map((option) => option.id),
)
export const VALID_ASPECT_RATIO_IDS = new Set<AspectRatioId>(
  ASPECT_RATIO_OPTIONS.map((option) => option.id),
)
export const VALID_FILTER_LOOK_IDS = new Set<FilterLookId>(
  FILTER_LOOK_OPTIONS.map((option) => option.id),
)
export const VALID_LIGHTING_IDS = new Set<LightingId>(
  LIGHTING_OPTIONS.map((option) => option.id),
)
export const VALID_PRESERVATION_STRENGTH_IDS = new Set<PreservationStrengthId>(
  PRESERVATION_STRENGTH_OPTIONS.map((option) => option.id),
)
export const VALID_ALLOWED_VARIATION_IDS = new Set<AllowedVariationId>(
  ALLOWED_VARIATION_OPTIONS.map((option) => option.id),
)
export const VALID_ENVIRONMENT_ENHANCEMENT_IDS = new Set<EnvironmentEnhancementId>(
  ENVIRONMENT_ENHANCEMENT_OPTIONS.map((option) => option.id),
)

export function isKnownPresetId(value: unknown): value is ImageRecreationFormState['presetId'] {
  return value === 'custom' || (typeof value === 'string' && value in PROMPT_PRESET_MAP)
}
