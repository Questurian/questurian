import type { Payload } from 'payload'

import { resolveMediaSetForPlacement } from '@/features/media/lib/resolve-public-image'
import type { PayloadInstance } from '@/types'

import {
  DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE,
  DEFAULT_AUTHOR_FEATURE_MOTION_STYLE,
  type AuthorFeatureImageStyle,
  type AuthorFeatureMotionStyle,
} from './constants'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function relationshipId(value: unknown): number | null {
  const raw = isRecord(value) ? value.id : value
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function authorImages(author: Record<string, unknown>): Record<string, unknown>[] {
  const images = author.authorImages
  if (!Array.isArray(images)) return []
  return images
    .map((entry) => (isRecord(entry) && isRecord(entry.mediaSet) ? entry.mediaSet : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function mediaSetHasAuthoredAlt(mediaSet: Record<string, unknown>): boolean {
  if (text(mediaSet.alt_text)) return true
  const variants = isRecord(mediaSet.variants) ? mediaSet.variants : null
  return Boolean(
    variants &&
    ['portrait', 'square', 'wide'].some((key) => {
      const asset = isRecord(variants[key]) ? variants[key] : null
      return asset ? text(asset.alt_text) : null
    }),
  )
}

function publicAuthorHref(slug: string | null): string | null {
  return slug ? `/authors/${slug}` : null
}

function selectedStyle(value: unknown): AuthorFeatureImageStyle {
  return value === 'circle' || value === 'square' || value === 'portrait' || value === 'mixed'
    ? value
    : DEFAULT_AUTHOR_FEATURE_IMAGE_STYLE
}

function selectedMotion(value: unknown): AuthorFeatureMotionStyle {
  return value === 'none' || value === 'subtle' ? value : DEFAULT_AUTHOR_FEATURE_MOTION_STYLE
}

export function authorIdsFromAuthorFeatureBlock(block: Record<string, unknown>): number[] {
  const cards = Array.isArray(block.authorCards) ? block.authorCards : []
  const ids = cards.map((card) => (isRecord(card) ? relationshipId(card.author) : null))
  return ids.filter((id): id is number => Boolean(id))
}

export async function assertAuthorFeatureItemsMatchAuthors(
  payload: Payload,
  refs: { relationTo: string; id: number }[],
  authorIds: number[],
): Promise<void> {
  if (!authorIds.length || !refs.length) return
  const allowed = new Set(authorIds)
  for (const ref of refs) {
    const doc = (await payload.findByID({
      collection: ref.relationTo as never,
      id: ref.id,
      depth: 0,
      overrideAccess: true,
      select: { author: true } as never,
    })) as unknown as Record<string, unknown>
    if (!allowed.has(relationshipId(doc.author) ?? 0)) {
      throw new Error('Author Feature articles must be written by one of the selected Authors.')
    }
  }
}

export async function resolveAuthorFeatureFields(
  payload: PayloadInstance,
  block: Record<string, unknown>,
) {
  const rawCards = Array.isArray(block.authorCards) ? block.authorCards : []
  const emphasizedIndex = Math.max(
    0,
    rawCards.findIndex((card) => isRecord(card) && card.isEmphasized === true),
  )

  const cards = await Promise.all(
    rawCards.slice(0, 4).map(async (rawCard, index) => {
      const card = isRecord(rawCard) ? rawCard : {}
      const authorId = relationshipId(card.author)
      if (!authorId) return null

      try {
        const author = (await payload.findByID({
          collection: 'authors',
          id: authorId,
          depth: 2,
          overrideAccess: true,
        })) as unknown as Record<string, unknown>
        const images = authorImages(author)
        const selectedImageId = relationshipId(card.image)
        const selectedMediaSet = selectedImageId
          ? (images.find((mediaSet) => relationshipId(mediaSet) === selectedImageId) ?? null)
          : null
        const imageId = selectedMediaSet ? relationshipId(selectedMediaSet) : null

        return {
          author: {
            id: authorId,
            name: text(author.displayName),
            slug: text(author.slug),
            href: publicAuthorHref(text(author.slug)),
            bio: text(author.bio),
            expertise: Array.isArray(author.expertise)
              ? author.expertise
                  .map((entry) => (isRecord(entry) ? text(entry.area) : null))
                  .filter(Boolean)
              : [],
          },
          imageMediaSetId: imageId,
          image: selectedMediaSet
            ? resolveMediaSetForPlacement(selectedMediaSet, 'portrait-card')
            : null,
          imageSquare: selectedMediaSet
            ? resolveMediaSetForPlacement(selectedMediaSet, 'square-card')
            : null,
          imageWide: selectedMediaSet
            ? resolveMediaSetForPlacement(selectedMediaSet, 'wide-card')
            : null,
          imageAltReady: selectedMediaSet ? mediaSetHasAuthoredAlt(selectedMediaSet) : false,
          spotlightNote: text(card.spotlightNote),
          isEmphasized: index === emphasizedIndex,
        }
      } catch {
        return {
          author: { id: authorId, name: null, slug: null, href: null, bio: null, expertise: [] },
          imageMediaSetId: null,
          image: null,
          imageSquare: null,
          imageWide: null,
          imageAltReady: false,
          spotlightNote: text(card.spotlightNote),
          isEmphasized: index === emphasizedIndex,
        }
      }
    }),
  )

  return {
    imageStyle: selectedStyle(block.imageStyle),
    motionStyle: selectedMotion(block.motionStyle),
    authorCards: cards.filter(Boolean),
  }
}
