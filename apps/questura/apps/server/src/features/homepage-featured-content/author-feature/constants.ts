export const AUTHOR_FEATURE_SLOT_COUNTS = [1, 2, 3, 4, 6] as const
export const AUTHOR_FEATURE_MAX_AUTHORS = 4
export const AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX = 160

export const AUTHOR_FEATURE_IMAGE_STYLES = ['circle', 'square', 'portrait', 'mixed'] as const
export type AuthorFeatureImageStyle = (typeof AUTHOR_FEATURE_IMAGE_STYLES)[number]

export const AUTHOR_FEATURE_MOTION_STYLES = ['none', 'subtle'] as const
export type AuthorFeatureMotionStyle = (typeof AUTHOR_FEATURE_MOTION_STYLES)[number]

export const DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE = 'mixed' satisfies AuthorFeatureImageStyle
export const DEFAULT_AUTHOR_FEATURE_MOTION_STYLE = 'subtle' satisfies AuthorFeatureMotionStyle
