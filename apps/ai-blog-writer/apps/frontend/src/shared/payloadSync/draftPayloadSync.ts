import { buildDraftPayloadSyncSignature } from './payloadSyncSignature'

export type PayloadSyncStateFields = {
  currentPayloadSignature?: string
  lastPayloadSyncSignature?: string
  lastPayloadSyncAt?: string
  hasUnsyncedPayloadChanges?: boolean
  /**
   * Fingerprint of upstream Location Manager media pools (per referenced
   * related item) captured at the moment of the last Payload sync. Unlike the
   * sync signature, this cannot be rebuilt from the Payload doc — it records
   * external state, so it must be carried across draft merges and reloads.
   */
  lastPayloadSyncMediaFingerprint?: string
}

type PayloadIdentityOptions<TDraft> = {
  hasPayloadIdentity?: (draft: TDraft) => boolean
}

type RefreshPayloadSyncOptions<TDraft> = PayloadIdentityOptions<TDraft> & {
  missingBaselineIsUnsynced?: boolean
  initializeMissingBaselineAsSynced?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hasDefaultPayloadIdentity(value: unknown): boolean {
  return isRecord(value) && typeof value.payloadId === 'number' && Number.isFinite(value.payloadId)
}

function resolveHasPayloadIdentity<TDraft>(draft: TDraft, options: PayloadIdentityOptions<TDraft> = {}): boolean {
  return options.hasPayloadIdentity ? options.hasPayloadIdentity(draft) : hasDefaultPayloadIdentity(draft)
}

export function readStoredPayloadSyncFields(value: unknown): PayloadSyncStateFields {
  if (!isRecord(value)) return {}

  const legacyBaseline = cleanString(value.payloadSyncBaseline)
  const legacyDirty = typeof value.hasLocalChanges === 'boolean' ? value.hasLocalChanges : undefined
  const fields: PayloadSyncStateFields = {}
  const currentPayloadSignature = cleanString(value.currentPayloadSignature)
  const lastPayloadSyncSignature = cleanString(value.lastPayloadSyncSignature) || legacyBaseline
  const lastPayloadSyncAt = cleanString(value.lastPayloadSyncAt)
  const lastPayloadSyncMediaFingerprint = cleanString(value.lastPayloadSyncMediaFingerprint)

  if (currentPayloadSignature) fields.currentPayloadSignature = currentPayloadSignature
  if (lastPayloadSyncSignature) fields.lastPayloadSyncSignature = lastPayloadSyncSignature
  if (lastPayloadSyncAt) fields.lastPayloadSyncAt = lastPayloadSyncAt
  if (lastPayloadSyncMediaFingerprint) fields.lastPayloadSyncMediaFingerprint = lastPayloadSyncMediaFingerprint
  if (typeof value.hasUnsyncedPayloadChanges === 'boolean') {
    fields.hasUnsyncedPayloadChanges = value.hasUnsyncedPayloadChanges
  } else if (typeof legacyDirty === 'boolean') {
    fields.hasUnsyncedPayloadChanges = legacyDirty
  }

  return fields
}

export function payloadSyncFieldsEqual(left: PayloadSyncStateFields, right: PayloadSyncStateFields): boolean {
  return (
    left.currentPayloadSignature === right.currentPayloadSignature &&
    left.lastPayloadSyncSignature === right.lastPayloadSyncSignature &&
    left.lastPayloadSyncAt === right.lastPayloadSyncAt &&
    left.lastPayloadSyncMediaFingerprint === right.lastPayloadSyncMediaFingerprint &&
    Boolean(left.hasUnsyncedPayloadChanges) === Boolean(right.hasUnsyncedPayloadChanges)
  )
}

export function hasUnsyncedPayloadChanges(input: {
  hasPayloadIdentity: boolean
  currentPayloadSignature?: string
  lastPayloadSyncSignature?: string
  hasUnsyncedPayloadChanges?: boolean
  missingBaselineIsUnsynced?: boolean
}): boolean {
  if (!input.hasPayloadIdentity) return false
  if (input.lastPayloadSyncSignature) {
    return input.currentPayloadSignature !== input.lastPayloadSyncSignature
  }
  if (typeof input.hasUnsyncedPayloadChanges === 'boolean') {
    return input.hasUnsyncedPayloadChanges
  }
  return Boolean(input.missingBaselineIsUnsynced)
}

export function refreshDraftPayloadSyncState<TDraft extends PayloadSyncStateFields>(
  draft: TDraft,
  buildComparableShape: (draft: TDraft) => unknown,
  options: RefreshPayloadSyncOptions<TDraft> = {},
): TDraft {
  const hasPayloadIdentity = resolveHasPayloadIdentity(draft, options)

  if (!hasPayloadIdentity) {
    return {
      ...draft,
      currentPayloadSignature: undefined,
      lastPayloadSyncSignature: undefined,
      lastPayloadSyncAt: undefined,
      lastPayloadSyncMediaFingerprint: undefined,
      hasUnsyncedPayloadChanges: false,
    }
  }

  const currentPayloadSignature = buildDraftPayloadSyncSignature(draft, buildComparableShape)
  const storedFields = readStoredPayloadSyncFields(draft)
  const storedDirty = Boolean(storedFields.hasUnsyncedPayloadChanges)
  const lastPayloadSyncSignature =
    storedFields.lastPayloadSyncSignature ||
    (options.initializeMissingBaselineAsSynced && !storedDirty ? currentPayloadSignature : undefined)

  return {
    ...draft,
    currentPayloadSignature,
    lastPayloadSyncSignature,
    lastPayloadSyncAt: storedFields.lastPayloadSyncAt,
    hasUnsyncedPayloadChanges: hasUnsyncedPayloadChanges({
      hasPayloadIdentity,
      currentPayloadSignature,
      lastPayloadSyncSignature,
      hasUnsyncedPayloadChanges: storedFields.hasUnsyncedPayloadChanges,
      missingBaselineIsUnsynced: options.missingBaselineIsUnsynced,
    }),
  }
}

export function markDraftAsPayloadSynced<TDraft extends PayloadSyncStateFields>(
  draft: TDraft,
  buildComparableShape: (draft: TDraft) => unknown,
  syncedAt: string,
  options: PayloadIdentityOptions<TDraft> = {},
): TDraft {
  if (!resolveHasPayloadIdentity(draft, options)) {
    return refreshDraftPayloadSyncState(draft, buildComparableShape, options)
  }

  const signature = buildDraftPayloadSyncSignature(draft, buildComparableShape)
  return {
    ...draft,
    currentPayloadSignature: signature,
    lastPayloadSyncSignature: signature,
    lastPayloadSyncAt: syncedAt,
    hasUnsyncedPayloadChanges: false,
  }
}

export function markDraftAsPayloadUnsynced<TDraft extends PayloadSyncStateFields>(
  draft: TDraft,
  buildComparableShape: (draft: TDraft) => unknown,
  options: PayloadIdentityOptions<TDraft> = {},
): TDraft {
  if (!resolveHasPayloadIdentity(draft, options)) {
    return refreshDraftPayloadSyncState(draft, buildComparableShape, options)
  }

  return {
    ...draft,
    currentPayloadSignature: buildDraftPayloadSyncSignature(draft, buildComparableShape),
    hasUnsyncedPayloadChanges: true,
  }
}

export function stripLegacyPayloadSyncFields<TDraft>(draft: TDraft): TDraft {
  const next = { ...draft } as TDraft & {
    payloadSyncBaseline?: unknown
    hasLocalChanges?: unknown
  }
  delete next.payloadSyncBaseline
  delete next.hasLocalChanges
  return next
}
