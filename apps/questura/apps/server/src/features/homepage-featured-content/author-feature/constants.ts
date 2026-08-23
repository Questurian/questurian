export const AUTHOR_FEATURE_SLOT_COUNTS = [1, 2, 3, 4, 6] as const
export const AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX = 160

export const AUTHOR_FEATURE_IMAGE_STYLES = ['circle', 'square', 'portrait'] as const
export type AuthorFeatureImageStyle = (typeof AUTHOR_FEATURE_IMAGE_STYLES)[number]

// Keep legacy `mixed` in Payload's stored enum so existing rows remain readable.
// Public resolution maps it to `portrait`; editors and update APIs cannot select it.
export const AUTHOR_FEATURE_STORED_IMAGE_STYLES = [...AUTHOR_FEATURE_IMAGE_STYLES, 'mixed'] as const

export const AUTHOR_FEATURE_MOTION_STYLES = ['none', 'subtle'] as const
export type AuthorFeatureMotionStyle = (typeof AUTHOR_FEATURE_MOTION_STYLES)[number]

export const DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE = 'portrait' satisfies AuthorFeatureImageStyle
export const DEFAULT_AUTHOR_FEATURE_MOTION_STYLE = 'subtle' satisfies AuthorFeatureMotionStyle
