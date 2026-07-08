import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'
import type { PayloadFindWhere } from '@/shared/utils/payload-types'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../constants'

import type { NumericReferenceRef, ParsedNumericReferenceSlot } from './refs'

export type NumericReferenceGridCandidate = {
  id: number
  title: string
  status: string | null
  imageUrl: string | null
}

export type NumericReferenceGridOptions = {
  allowDrafts?: boolean
  slotCount?: number
  totalSlots?: number
}

export type NumericReferenceGridValidationConfig<
  TRef extends NumericReferenceRef,
  TCandidate extends NumericReferenceGridCandidate,
> = {
  findDoc: (payload: Payload, ref: TRef) => Promise<TCandidate | null>
  duplicateMessage: string
  notFoundMessage: (ref: TRef) => string
  unpublishedMessage: (candidate: TCandidate) => string
  missingImageMessage: (candidate: TCandidate) => string
}

export async function validateNumericReferenceGridItems<
  TRef extends NumericReferenceRef,
  TCandidate extends NumericReferenceGridCandidate,
>(
  payload: Payload,
  refs: TRef[],
  options: NumericReferenceGridOptions,
  config: NumericReferenceGridValidationConfig<TRef, TCandidate>,
): Promise<TRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const ids = new Set<number>()
  for (const ref of refs) {
    if (ids.has(ref.id)) throw new Error(config.duplicateMessage)
    ids.add(ref.id)
  }

  await Promise.all(
    refs.map(async (ref) => {
      const candidate = await config.findDoc(payload, ref)
      if (!candidate) throw new Error(config.notFoundMessage(ref))
      if (!allowDrafts && candidate.status !== 'published') {
        throw new Error(config.unpublishedMessage(candidate))
      }
      if (!candidate.imageUrl) {
        throw new Error(config.missingImageMessage(candidate))
      }
    }),
  )

  return refs
}

export type NumericReferenceInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: 'invalid_reference' | 'not_found' | 'not_published'
}

export type NumericReferenceSelection<TCandidate extends NumericReferenceGridCandidate> = {
  items: Array<TCandidate & { slot: number }>
  invalidItems: NumericReferenceInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type NumericReferenceGridSelectionConfig<
  TRef extends NumericReferenceRef,
  TCandidate extends NumericReferenceGridCandidate,
> = {
  findDoc: (payload: Payload, ref: TRef) => Promise<TCandidate | null>
  parseSlots: (rawItems: unknown) => ParsedNumericReferenceSlot<TRef>[]
}

export async function getNumericReferenceGridSelectionFromItems<
  TRef extends NumericReferenceRef,
  TCandidate extends NumericReferenceGridCandidate,
>(
  payload: Payload,
  rawItems: unknown,
  options: NumericReferenceGridOptions,
  config: NumericReferenceGridSelectionConfig<TRef, TCandidate>,
): Promise<NumericReferenceSelection<TCandidate>> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const totalSlots = options.totalSlots ?? HOMEPAGE_FEATURED_CONTENT_SLOTS
  const parsedSlots = config.parseSlots(rawItems)
  const items: Array<TCandidate & { slot: number }> = []
  const invalidItems: NumericReferenceInvalidItem[] = []

  for (const slot of parsedSlots) {
    if (!slot.ref) {
      invalidItems.push({ slot: slot.slot, reason: slot.reason || 'invalid_reference' })
      continue
    }
    const candidate = await config.findDoc(payload, slot.ref)
    if (!candidate) {
      invalidItems.push({ slot: slot.slot, id: slot.ref.id, reason: 'not_found' })
      continue
    }
    if (!allowDrafts && candidate.status !== 'published') {
      invalidItems.push({
        slot: slot.slot,
        id: candidate.id,
        title: candidate.title,
        reason: 'not_published',
      })
      continue
    }
    items.push({ ...candidate, slot: slot.slot })
  }

  return {
    items,
    invalidItems,
    allowDrafts,
    totalSlots,
    isComplete:
      items.length === totalSlots && invalidItems.length === 0 && parsedSlots.length === totalSlots,
  }
}

export type ReferenceGridSearchOptions = {
  query?: string
  page?: number
  limit?: number
  allowDrafts?: boolean
}

export function normalizeReferenceGridSearchOptions(options: ReferenceGridSearchOptions = {}) {
  const query = options.query?.trim() || ''
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0 ? Math.trunc(options.page!) : 1
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.trunc(options.limit!), 50)
      : 24

  return { query, allowDrafts, page, limit }
}

export function combinePayloadWhereClauses(
  whereClauses: PayloadFindWhere[],
): PayloadFindWhere | undefined {
  return whereClauses.length > 1 ? { and: whereClauses } : whereClauses[0]
}
