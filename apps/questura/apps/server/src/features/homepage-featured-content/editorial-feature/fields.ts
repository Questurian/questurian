import {
  EDITORIAL_FEATURE_DESCRIPTION_MAX,
  EDITORIAL_FEATURE_KICKER_MAX,
  EDITORIAL_FEATURE_TITLE_MAX,
} from './constants'

export type ParsedEditorialFeatureField<T> =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: T }
  | { ok: false; message: string }

function parseTextField(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
  singleParagraph = false,
): ParsedEditorialFeatureField<string | null> {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return { ok: true, omit: true }
  const raw = body[field]
  if (raw !== null && typeof raw !== 'string') {
    return { ok: false, message: `${field} must be a string or null.` }
  }
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (singleParagraph && /[\r\n]/.test(value)) {
    return { ok: false, message: `${field} must be one paragraph.` }
  }
  if (value.length > maxLength) {
    return { ok: false, message: `${field} must be ${maxLength} characters or fewer.` }
  }
  return { ok: true, omit: false, value: value || null }
}
function parseRelationshipField(
  body: Record<string, unknown>,
  field: string,
): ParsedEditorialFeatureField<number | null> {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return { ok: true, omit: true }
  const raw = body[field]
  if (raw === null) return { ok: true, omit: false, value: null }
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isInteger(value) || value <= 0) {
    return { ok: false, message: `${field} must be a positive numeric id or null.` }
  }
  return { ok: true, omit: false, value }
}

export function parseEditorialFeatureFields(body: Record<string, unknown>) {
  return {
    featureKicker: parseTextField(body, 'featureKicker', EDITORIAL_FEATURE_KICKER_MAX),
    featureTitle: parseTextField(body, 'featureTitle', EDITORIAL_FEATURE_TITLE_MAX),
    featureDescription: parseTextField(
      body,
      'featureDescription',
      EDITORIAL_FEATURE_DESCRIPTION_MAX,
      true,
    ),
    featureMediaSet: parseRelationshipField(body, 'featureMediaSet'),
    linkedLocation: parseRelationshipField(body, 'linkedLocation'),
  }
}

export function hasEditorialFeatureFieldUpdates(
  fields: ReturnType<typeof parseEditorialFeatureFields>,
): boolean {
  return Object.values(fields).some((field) => field.ok && !field.omit)
}
