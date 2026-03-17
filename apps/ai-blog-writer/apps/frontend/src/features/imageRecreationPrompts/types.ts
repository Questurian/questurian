export type SceneCategoryId =
  | 'landscape-only'
  | 'scenic-viewpoint'
  | 'tourist-landmark'
  | 'tourist-landmark-no-people'
  | 'tourist-landmark-sparse-people'
  | 'tourist-landmark-crowd'
  | 'city-street-scene'
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
  | 'preserve-exactly'
  | 'preserve-count-minor-natural-changes'
  | 'preserve-scene-subtle-reshuffling'
  | 'keep-people-secondary'
  | 'keep-environment-primary'

export type PrimarySubjectEmphasisId =
  | 'environment-first'
  | 'landmark-first'
  | 'person-first'
  | 'balanced-scene'

export type CameraPresetId =
  | 'sony-a7r-v'
  | 'sony-a7-iv'
  | 'sony-a1'
  | 'canon-r5'
  | 'canon-r6-mark-ii'
  | 'nikon-z8'
  | 'nikon-zf'
  | 'fujifilm-gfx-100s'
  | 'fujifilm-x100vi'
  | 'leica-q3'
  | 'contax-t2'
  | 'leica-m6'
  | 'hasselblad-500cm'
  | 'mamiya-7'
  | 'pentax-67'
  | 'canon-ae-1'
  | 'nikon-fm2'
  | 'polaroid-sx-70'

export type LensPresetId =
  | '24mm-f1-4'
  | '28mm-f2'
  | '35mm-f1-8'
  | '35mm-f1-4'
  | '50mm-f1-4'
  | '50mm-f1-8'
  | '85mm-f1-8'
  | '70-200mm-f2-8'
  | '24-70mm-f2-8'
  | '16-35mm-f2-8'
  | '35mm-vintage-rangefinder'
  | '50mm-vintage-fast-prime'
  | '85mm-vintage-portrait'
  | 'soft-vintage-film-lens'
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

export type AspectRatioId =
  | 'match-reference'
  | '1-1-square'
  | '4-5-portrait'
  | '3-4-portrait'
  | '2-3-portrait'
  | '3-2-landscape'
  | '4-3-landscape'
  | '16-9-widescreen'
  | '9-16-vertical'

export type FilterLookId =
  | 'neutral-no-filter'
  | 'iphone-natural'
  | 'iphone-vivid'
  | 'fujifilm-classic-chrome'
  | 'kodak-portra-400'
  | 'kodak-gold-200'
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
  peoplePresence: PeoplePresenceId
  peopleHandling: PeopleHandlingId
  primarySubjectEmphasis: PrimarySubjectEmphasisId
  cameraPreset: CameraPresetId
  lensPreset: LensPresetId
  captureStyle: CaptureStyleId
  aspectRatio: AspectRatioId
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
  values: Omit<ImageRecreationFormState, 'presetId' | 'extraInstructions'> & {
    extraInstructions?: string
  }
}
