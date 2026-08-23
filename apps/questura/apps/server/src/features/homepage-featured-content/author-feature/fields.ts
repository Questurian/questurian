import {
  AUTHOR_FEATURE_DESCRIPTION_MODES,
  AUTHOR_FEATURE_EXPERTISE_AREA_MAX,
  AUTHOR_FEATURE_EXPERTISE_MODES,
  AUTHOR_FEATURE_IMAGE_STYLES,
  AUTHOR_FEATURE_MOTION_STYLES,
  AUTHOR_FEATURE_SELECTED_EXPERTISE_MAX,
  AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX,
  DEFAULT_AUTHOR_FEATURE_DESCRIPTION_MODE,
  DEFAULT_AUTHOR_FEATURE_EXPERTISE_MODE,
  DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE,
  DEFAULT_AUTHOR_FEATURE_MOTION_STYLE,
  type AuthorFeatureDescriptionMode,
  type AuthorFeatureExpertiseMode,
  type AuthorFeatureImageStyle,
  type AuthorFeatureMotionStyle,
} from './constants'
import type { PayloadInstance } from '@/types'

type ParseResult<T> =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: T }
  | { ok: false; message: string }

function intId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const raw =
    typeof value === 'object' && value !== null && 'id' in value
      ? (value as { id?: unknown }).id
      : value
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function authorImageIds(author: Record<string, unknown>): Set<number> {
  const images = author.authorImages
  if (!Array.isArray(images)) return new Set()
  return new Set(
    images
      .map((entry) => {
        if (!isRecord(entry)) return null
        return intId(entry.mediaSet)
      })
      .filter((id): id is number => Boolean(id)),
  )
}

function parseStyle<T extends readonly string[]>(
  body: Record<string, unknown>,
  key: string,
  allowed: T,
  fallback: T[number],
): ParseResult<T[number]> {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return { ok: true, omit: true }
  const value = body[key]
  if (typeof value !== 'string') return { ok: false, message: `${key} must be a string.` }
  return allowed.includes(value)
    ? { ok: true, omit: false, value }
    : { ok: true, omit: false, value: fallback }
}

export type AuthorFeatureCardInput = {
  author: number
  image: number | null
  spotlightNote: string | null
}

export function parseAuthorFeatureImageStyleBodyField(
  body: Record<string, unknown>,
): ParseResult<AuthorFeatureImageStyle> {
  return parseStyle(
    body,
    'imageStyle',
    AUTHOR_FEATURE_IMAGE_STYLES,
    DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE,
  )
}

export function parseAuthorFeatureMotionStyleBodyField(
  body: Record<string, unknown>,
): ParseResult<AuthorFeatureMotionStyle> {
  return parseStyle(
    body,
    'motionStyle',
    AUTHOR_FEATURE_MOTION_STYLES,
    DEFAULT_AUTHOR_FEATURE_MOTION_STYLE,
  )
}

export function parseAuthorFeatureDescriptionModeBodyField(
  body: Record<string, unknown>,
): ParseResult<AuthorFeatureDescriptionMode> {
  return parseStyle(
    body,
    'descriptionMode',
    AUTHOR_FEATURE_DESCRIPTION_MODES,
    DEFAULT_AUTHOR_FEATURE_DESCRIPTION_MODE,
  )
}

export function parseAuthorFeatureExpertiseModeBodyField(
  body: Record<string, unknown>,
): ParseResult<AuthorFeatureExpertiseMode> {
  return parseStyle(
    body,
    'expertiseMode',
    AUTHOR_FEATURE_EXPERTISE_MODES,
    DEFAULT_AUTHOR_FEATURE_EXPERTISE_MODE,
  )
}

export function parseAuthorFeatureSelectedExpertiseBodyField(
  body: Record<string, unknown>,
): ParseResult<{ area: string }[]> {
  if (!Object.prototype.hasOwnProperty.call(body, 'selectedExpertise')) {
    return { ok: true, omit: true }
  }
  if (!Array.isArray(body.selectedExpertise)) {
    return { ok: false, message: 'selectedExpertise must be an array.' }
  }

  const value = [
    ...new Set(
      body.selectedExpertise
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .map((entry) => entry.slice(0, AUTHOR_FEATURE_EXPERTISE_AREA_MAX)),
    ),
  ].slice(0, AUTHOR_FEATURE_SELECTED_EXPERTISE_MAX)

  return { ok: true, omit: false, value: value.map((area) => ({ area })) }
}

export function parseAuthorFeatureCardsBodyField(
  body: Record<string, unknown>,
): ParseResult<AuthorFeatureCardInput[]> {
  if (!Object.prototype.hasOwnProperty.call(body, 'authorCards')) {
    return { ok: true, omit: true }
  }
  if (!Array.isArray(body.authorCards)) {
    return { ok: false, message: 'authorCards must be an array.' }
  }
  if (body.authorCards.length !== 1) {
    return { ok: false, message: 'Author Feature supports exactly one Author.' }
  }

  const cards: AuthorFeatureCardInput[] = []
  for (const raw of body.authorCards) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, message: 'Every authorCards entry must be an object.' }
    }
    const item = raw as Record<string, unknown>
    const author = intId(item.author)
    if (!author) return { ok: false, message: 'Every authorCards entry needs an author id.' }
    const note = typeof item.spotlightNote === 'string' ? item.spotlightNote.trim() : ''
    cards.push({
      author,
      image: intId(item.image),
      spotlightNote: note ? note.slice(0, AUTHOR_FEATURE_SPOTLIGHT_NOTE_MAX) : null,
    })
  }

  return { ok: true, omit: false, value: cards }
}

export function hasAuthorFeatureFieldUpdates(fields: {
  authorCards: ParseResult<AuthorFeatureCardInput[]>
  descriptionMode: ParseResult<AuthorFeatureDescriptionMode>
  expertiseMode: ParseResult<AuthorFeatureExpertiseMode>
  imageStyle: ParseResult<AuthorFeatureImageStyle>
  motionStyle: ParseResult<AuthorFeatureMotionStyle>
  selectedExpertise: ParseResult<{ area: string }[]>
}): boolean {
  return (
    (fields.authorCards.ok && !fields.authorCards.omit) ||
    (fields.descriptionMode.ok && !fields.descriptionMode.omit) ||
    (fields.expertiseMode.ok && !fields.expertiseMode.omit) ||
    (fields.imageStyle.ok && !fields.imageStyle.omit) ||
    (fields.motionStyle.ok && !fields.motionStyle.omit) ||
    (fields.selectedExpertise.ok && !fields.selectedExpertise.omit)
  )
}

export async function validateAuthorFeatureCardImageSelections(
  payload: PayloadInstance,
  cards: AuthorFeatureCardInput[],
): Promise<string | null> {
  for (const [index, card] of cards.entries()) {
    if (!card.image) {
      return `Author Feature card ${index + 1} needs a selected Author image.`
    }

    const author = (await payload.findByID({
      collection: 'authors',
      id: card.author,
      depth: 2,
      overrideAccess: true,
      select: { authorImages: true } as never,
    })) as unknown as Record<string, unknown>

    if (!authorImageIds(author).has(card.image)) {
      return `Author Feature card ${index + 1} image must be one of that Author’s uploaded images.`
    }
  }

  return null
}
