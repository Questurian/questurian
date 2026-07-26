import type { LocationDocumentDraft, PayloadLocationBody, PayloadLocationDoc, PayloadRelationship } from './types'
import {
  markDraftAsPayloadSynced as markPayloadSyncStateSynced,
  readStoredPayloadSyncFields,
  refreshDraftPayloadSyncState as refreshPayloadSyncState,
} from '../../shared/payloadSync/draftPayloadSync'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatFallbackName(value: string): string {
  if (!value) return ''

  return value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extractRelationshipId(value: PayloadRelationship): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id
  return null
}

function extractLegacyCoverImage(input: Record<string, unknown>): number | null {
  const guide = input.guide
  if (!isRecord(guide)) return null

  const media = guide.media
  if (!isRecord(media)) return null

  return extractRelationshipId(media.coverImage as PayloadRelationship)
}

function resolveHierarchyTitlePart(nameValue: string, keyValue: string): string {
  const name = nameValue.trim()
  if (name) return name

  const normalizedKey = normalizeKeyPart(keyValue)
  return normalizedKey ? formatFallbackName(normalizedKey) : ''
}

export function createEmptyLocationDraft(): LocationDocumentDraft {
  return {
    draftId: `location_${Date.now()}`,
    updatedAt: new Date().toISOString(),
    level: 'country',
    country: '',
    city: '',
    neighborhood: '',
    countryName: '',
    cityName: '',
    neighborhoodName: '',
    locationKey: null,
    parentKey: null,
    coverImage: null,
  }
}

export function sanitizeLocationDraftShape(input: unknown): LocationDocumentDraft {
  const base = createEmptyLocationDraft()
  if (!isRecord(input)) return base

  const level = input.level === 'city' || input.level === 'neighborhood' ? input.level : 'country'
  const hasTopLevelCoverImage =
    Object.prototype.hasOwnProperty.call(input, 'coverImage') && input.coverImage !== undefined
  const topLevelCoverImage = extractRelationshipId(input.coverImage as PayloadRelationship)
  const legacyCoverImage = extractLegacyCoverImage(input)

  return {
    ...base,
    draftId: trimText(input.draftId) || base.draftId,
    payloadId: typeof input.payloadId === 'number' && Number.isFinite(input.payloadId) ? input.payloadId : undefined,
    ...readStoredPayloadSyncFields(input),
    level,
    country: trimText(input.country),
    city: trimText(input.city),
    neighborhood: trimText(input.neighborhood),
    countryName: trimText(input.countryName),
    cityName: trimText(input.cityName),
    neighborhoodName: trimText(input.neighborhoodName),
    locationKey: trimText(input.locationKey) || null,
    parentKey: trimText(input.parentKey) || null,
    coverImage: hasTopLevelCoverImage ? topLevelCoverImage : legacyCoverImage,
    updatedAt: trimText(input.updatedAt) || base.updatedAt,
  }
}

export function buildLocationHierarchyTitle(
  draft: Pick<
    LocationDocumentDraft,
    'level' | 'country' | 'city' | 'neighborhood' | 'countryName' | 'cityName' | 'neighborhoodName'
  >,
): string {
  const country = resolveHierarchyTitlePart(draft.countryName, draft.country)
  const city = resolveHierarchyTitlePart(draft.cityName, draft.city)
  const neighborhood = resolveHierarchyTitlePart(draft.neighborhoodName, draft.neighborhood)

  if (draft.level === 'country') return country
  if (draft.level === 'city') return [city, country].filter(Boolean).join(', ')
  return [neighborhood, city, country].filter(Boolean).join(', ')
}

export function buildDraftFromPayloadDoc(doc: PayloadLocationDoc): LocationDocumentDraft {
  const draft = sanitizeLocationDraftShape({
    payloadId: doc.id,
    level: doc.level,
    country: doc.country,
    city: doc.city,
    neighborhood: doc.neighborhood,
    countryName: doc.countryName,
    cityName: doc.cityName,
    neighborhoodName: doc.neighborhoodName,
    locationKey: doc.locationKey,
    parentKey: doc.parentKey,
    coverImage: doc.coverImage,
    guide: doc.guide,
    updatedAt: doc.updatedAt,
  })

  return markDraftAsPayloadSynced(draft, doc.updatedAt || new Date().toISOString())
}

export function buildPayloadLocationBody(draft: LocationDocumentDraft): PayloadLocationBody {
  const sanitized = sanitizeLocationDraftShape(draft)
  return {
    coverImage: sanitized.coverImage,
  }
}

export function refreshDraftPayloadSyncState(draft: LocationDocumentDraft): LocationDocumentDraft {
  return refreshPayloadSyncState(sanitizeLocationDraftShape(draft), buildPayloadLocationBody, {
    missingBaselineIsUnsynced: true,
  })
}

export function markDraftAsPayloadSynced(draft: LocationDocumentDraft, syncedAt: string): LocationDocumentDraft {
  return markPayloadSyncStateSynced(sanitizeLocationDraftShape(draft), buildPayloadLocationBody, syncedAt)
}

export function validateDraft(draft: LocationDocumentDraft): string | null {
  if (typeof draft.payloadId !== 'number' || !Number.isFinite(draft.payloadId)) {
    return 'Open an existing Payload location before syncing.'
  }

  return null
}
