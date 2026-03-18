export type SceneCategoryId =
  | 'landscape-only'
  | 'scenic-viewpoint'
  | 'tourist-landmark'
  | 'tourist-landmark-no-people'
  | 'tourist-landmark-sparse-people'
  | 'tourist-landmark-crowd'
  | 'city-street-scene'
  | 'street-art-mural'
  | 'market-food-stall'
  | 'cafe-restaurant-scene'
  | 'rooftop-terrace-view'
  | 'nightlife-neon-scene'
  | 'architecture-exterior'
  | 'architecture-interior'
  | 'portrait'
  | 'couple-friends-photo'
  | 'group-photo'
  | 'lifestyle-candid-people'
  | 'product-object'
  | 'nature-wilderness'
  | 'beach-coastal'
  | 'mountain-hiking'
  | 'desert-rock-formations'

export type PeoplePresenceId =
  | 'no-people'
  | 'one-person'
  | 'two-people'
  | 'small-group'
  | 'spread-out-crowd'
  | 'dense-crowd'

export type PeopleHandlingId =
  | 'keep-every-person-as-is'
  | 'keep-same-people-small-natural-changes'
  | 'keep-same-people-small-repositioning'
  | 'reduce-a-few-people'
  | 'remove-all-people'
  | 'change-every-person-and-reshuffle'
  | 'reshuffle-and-add-people-naturally'
  | 'people-secondary-environment-primary'
  | 'environment-dominant-with-people'

export type CrowdCharacterId =
  | 'match-reference-crowd'
  | 'international-tourist-mix'
  | 'locals-dominant'
  | 'mixed-age-travelers'
  | 'family-heavy-travelers'
  | 'adult-travelers'
  | 'backpacker-travel-crowd'
  | 'stylish-city-weekend-crowd'
  | 'understated-neutral-crowd'

export type PrimarySubjectEmphasisId =
  | 'environment-first'
  | 'landmark-first'
  | 'person-first'
  | 'balanced-scene'

export type CameraPresetId =
  | 'sony-a7r-v'
  | 'sony-a7-iv'
  | 'sony-a1'
  | 'sony-a9-iii'
  | 'canon-r5'
  | 'canon-r6-mark-ii'
  | 'canon-r1'
  | 'canon-r3'
  | 'nikon-z8'
  | 'nikon-z9'
  | 'nikon-zf'
  | 'fujifilm-gfx-100s'
  | 'hasselblad-x2d-100c'
  | 'fujifilm-x-t5'
  | 'fujifilm-x100vi'
  | 'leica-q3'
  | 'leica-sl3'
  | 'leica-m11'
  | 'contax-t2'
  | 'yashica-t4'
  | 'leica-m6'
  | 'hasselblad-500cm'
  | 'mamiya-7'
  | 'pentax-67'
  | 'canon-ae-1'
  | 'nikon-fm2'
  | 'olympus-om-1'
  | 'minolta-cle'
  | 'polaroid-sx-70'

export type LensPresetId =
  | '20mm-f1-8'
  | '24mm-f1-4'
  | '24mm-f1-8'
  | '28mm-f2'
  | '28-70mm-f2'
  | '35mm-f1-8'
  | '35mm-f1-4'
  | '50mm-f1-2'
  | '50mm-f1-4'
  | '50mm-f1-8'
  | '90mm-f2'
  | '85mm-f1-8'
  | '85mm-f1-2'
  | '135mm-f1-8'
  | '14-24mm-f2-8'
  | '70-200mm-f2-8'
  | '100-400mm-f4-5-5-6'
  | '24-70mm-f2-8'
  | '16-35mm-f2-8'
  | '21mm-vintage-ultra-wide'
  | '35mm-vintage-rangefinder'
  | '40mm-vintage-pancake'
  | '50mm-vintage-fast-prime'
  | '85mm-vintage-portrait'
  | 'soft-vintage-film-lens'
  | 'swirly-vintage-portrait-lens'
  | 'anamorphic-vintage-inspired'
  | 'classic-medium-format-rendering'
  | '45mm-equivalent-medium-format'

export type CaptureStyleId =
  | 'editorial'
  | 'natural-documentary'
  | 'luxury-campaign'
  | 'travel-photography'
  | 'street-photography'
  | 'fine-art-landscape'
  | 'filmic-vintage'
  | 'real-estate-architecture-clean'
  | 'casual-candid'

export type ShotPerspectiveId =
  | 'match-reference-viewpoint'
  | 'eye-level-natural'
  | 'low-angle-upward'
  | 'ground-level-dramatic'
  | 'high-angle-downward'
  | 'elevated-overlook'
  | 'birds-eye-overhead'
  | 'drone-oblique'
  | 'straight-on-frontal'
  | 'three-quarter-oblique'
  | 'side-profile-angle'
  | 'tilted-dynamic'
  | 'foreground-led-wide'
  | 'telephoto-observer'

export type FilterLookId =
  | 'neutral-no-filter'
  | 'iphone-natural'
  | 'iphone-vivid'
  | 'fujifilm-classic-chrome'
  | 'fujifilm-nostalgic-neg'
  | 'fujifilm-reala-ace'
  | 'fujifilm-pro-400h'
  | 'kodak-portra-400'
  | 'kodak-portra-800'
  | 'kodak-gold-200'
  | 'kodak-ektar-100'
  | 'kodak-ultramax-400'
  | 'cinestill-800t'
  | 'kodachrome-64'
  | 'agfa-vista-200'
  | 'faded-print-vintage'
  | 'faded-disposable-film'
  | 'dusty-postcard-vintage'
  | 'expired-color-negative'
  | 'ilford-hp5-bw'
  | 'kodak-tri-x-400'
  | 'leica-natural'

export type LightingId =
  | 'clear-bright-midday-sun'
  | 'soft-morning-light'
  | 'golden-hour'
  | 'sunset-glow'
  | 'blue-hour'
  | 'overcast-soft-light'
  | 'diffused-cloudy-daylight'
  | 'dramatic-storm-light'
  | 'hazy-afternoon-light'
  | 'backlit-sunlight'
  | 'window-light'
  | 'night-city-lights'
  | 'mixed-urban-lighting'
  | 'flat-neutral-daylight'

export type PreservationStrengthId = 'strict' | 'balanced' | 'flexible'

export type AllowedVariationId =
  | 'no-variation'
  | 'small-environmental-cleanup'
  | 'small-wardrobe-changes'
  | 'small-positional-shifts'
  | 'minor-secondary-detail-changes'

export type EnvironmentEnhancementId =
  | 'minimal'
  | 'moderate-realism-boost'
  | 'strong-realism-boost'

export type PromptPresetId =
  | 'famous-landmark-no-people'
  | 'desert-landscape-editorial'
  | 'famous-landmark-sparse-people'
  | 'city-square-blue-hour'
  | 'mountain-viewpoint'
  | 'couple-travel-photo'
  | 'vintage-street-scene'
  | 'custom'

export interface PromptBlock {
  id:
    | 'reference-anchoring'
    | 'scene-preservation'
    | 'people-preservation'
    | 'camera-lens-realism'
    | 'lighting-description'
    | 'style-description'
    | 'environment-realism'
    | 'user-guidance'
    | 'negative-instructions'
  title: string
  text: string
}

export interface PromptBuildResult {
  blocks: PromptBlock[]
  finalPrompt: string
}

export interface ImageRecreationFormState {
  presetId: PromptPresetId
  sceneCategory: SceneCategoryId
  referenceHasPeople: boolean
  peoplePresence: PeoplePresenceId
  peopleHandling: PeopleHandlingId
  crowdCharacter: CrowdCharacterId
  primarySubjectEmphasis: PrimarySubjectEmphasisId
  cameraPreset: CameraPresetId
  lensPreset: LensPresetId
  captureStyle: CaptureStyleId
  shotPerspective: ShotPerspectiveId
  centerMainSubject: boolean
  filterLook: FilterLookId
  lighting: LightingId
  preservationStrength: PreservationStrengthId
  allowedVariation: AllowedVariationId
  environmentEnhancement: EnvironmentEnhancementId
  extraInstructions: string
}

export interface SelectOption<TId extends string> {
  id: TId
  label: string
  description: string
  prompt: string
  disabled?: boolean
}

export interface OptionGroup<TId extends string> {
  label: string
  options: SelectOption<TId>[]
}

export interface SceneCategoryOption extends SelectOption<SceneCategoryId> {
  helperText: string
  recommendedPeoplePresence: PeoplePresenceId
}

export interface PromptPreset {
  id: Exclude<PromptPresetId, 'custom'>
  label: string
  description: string
  values: Omit<
    ImageRecreationFormState,
    'presetId' | 'extraInstructions' | 'referenceHasPeople' | 'centerMainSubject'
  > & {
    referenceHasPeople?: boolean
    centerMainSubject?: boolean
    extraInstructions?: string
  }
}
