export const AUTHOR_FEATURE_SLOT_COUNTS = [1, 2, 3, 4, 6] as const
export const AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX = 160
export const AUTHOR_FEATURE_SELECTED_EXPERTISE_MAX = 12
export const AUTHOR_FEATURE_EXPERTISE_AREA_MAX = 80
export const AUTHOR_FEATURE_DESCRIPTION_MODES = ['profile', 'custom'] as const
export type AuthorFeatureDescriptionMode = (typeof AUTHOR_FEATURE_DESCRIPTION_MODES)[number]
export const AUTHOR_FEATURE_EXPERTISE_MODES = ['profile', 'selected'] as const
export type AuthorFeatureExpertiseMode = (typeof AUTHOR_FEATURE_EXPERTISE_MODES)[number]

export const AUTHOR_FEATURE_IMAGE_STYLES = ['circle', 'square', 'portrait'] as const
export type AuthorFeatureImageStyle = (typeof AUTHOR_FEATURE_IMAGE_STYLES)[number]

// Keep legacy `mixed` in Payload's stored enum so existing rows remain readable.
// Public resolution maps it to `portrait`; editors and update APIs cannot select it.
export const AUTHOR_FEATURE_STORED_IMAGE_STYLES = [...AUTHOR_FEATURE_IMAGE_STYLES, 'mixed'] as const

export const AUTHOR_FEATURE_MOTION_STYLES = ['none', 'subtle'] as const
export type AuthorFeatureMotionStyle = (typeof AUTHOR_FEATURE_MOTION_STYLES)[number]

export const DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE = 'portrait' satisfies AuthorFeatureImageStyle
export const DEFAULT_AUTHOR_FEATURE_MOTION_STYLE = 'subtle' satisfies AuthorFeatureMotionStyle
export const DEFAULT_AUTHOR_FEATURE_DESCRIPTION_MODE =
  'profile' satisfies AuthorFeatureDescriptionMode
export const DEFAULT_AUTHOR_FEATURE_EXPERTISE_MODE = 'profile' satisfies AuthorFeatureExpertiseMode
