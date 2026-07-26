import {
  hasUnsyncedPayloadChanges,
  markDraftAsPayloadSynced,
  markDraftAsPayloadUnsynced,
  payloadSyncFieldsEqual,
  readStoredPayloadSyncFields,
  refreshDraftPayloadSyncState,
  stripLegacyPayloadSyncFields,
  type PayloadSyncStateFields,
} from './draftPayloadSync'

type TestDraft = PayloadSyncStateFields & {
  payloadId?: number
  externalId?: string
  title: string
}

const buildComparableShape = (draft: TestDraft) => ({
  title: draft.title.trim(),
})

describe('stored Payload Sync state', () => {
  it('reads current fields and trims persisted strings', () => {
    expect(
      readStoredPayloadSyncFields({
        currentPayloadSignature: ' current ',
        lastPayloadSyncSignature: ' baseline ',
        lastPayloadSyncAt: ' 2026-07-25T12:00:00.000Z ',
        lastPayloadSyncMediaFingerprint: ' media ',
        hasUnsyncedPayloadChanges: true,
      }),
    ).toEqual({
      currentPayloadSignature: 'current',
      lastPayloadSyncSignature: 'baseline',
      lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
      lastPayloadSyncMediaFingerprint: 'media',
      hasUnsyncedPayloadChanges: true,
    })
  })

  it('falls back to legacy baseline and dirty fields', () => {
    expect(
      readStoredPayloadSyncFields({
        payloadSyncBaseline: ' legacy-baseline ',
        hasLocalChanges: true,
      }),
    ).toEqual({
      lastPayloadSyncSignature: 'legacy-baseline',
      hasUnsyncedPayloadChanges: true,
    })
  })

  it('ignores malformed persisted state', () => {
    expect(readStoredPayloadSyncFields(null)).toEqual({})
    expect(
      readStoredPayloadSyncFields({
        currentPayloadSignature: 1,
        lastPayloadSyncSignature: ' ',
        hasUnsyncedPayloadChanges: 'yes',
      }),
    ).toEqual({})
  })
})

describe('Payload Sync dirty-state resolution', () => {
  it('requires Payload identity before a draft can be dirty', () => {
    expect(
      hasUnsyncedPayloadChanges({
        hasPayloadIdentity: false,
        currentPayloadSignature: 'current',
        lastPayloadSyncSignature: 'baseline',
        hasUnsyncedPayloadChanges: true,
        missingBaselineIsUnsynced: true,
      }),
    ).toBe(false)
  })

  it('prefers signature comparison, then stored dirty state, then missing-baseline policy', () => {
    expect(
      hasUnsyncedPayloadChanges({
        hasPayloadIdentity: true,
        currentPayloadSignature: 'current',
        lastPayloadSyncSignature: 'current',
        hasUnsyncedPayloadChanges: true,
      }),
    ).toBe(false)
    expect(
      hasUnsyncedPayloadChanges({
        hasPayloadIdentity: true,
        currentPayloadSignature: 'current',
        lastPayloadSyncSignature: 'baseline',
        hasUnsyncedPayloadChanges: false,
      }),
    ).toBe(true)
    expect(
      hasUnsyncedPayloadChanges({
        hasPayloadIdentity: true,
        hasUnsyncedPayloadChanges: true,
      }),
    ).toBe(true)
    expect(
      hasUnsyncedPayloadChanges({
        hasPayloadIdentity: true,
        missingBaselineIsUnsynced: true,
      }),
    ).toBe(true)
  })

  it('compares every persisted sync field', () => {
    const fields: PayloadSyncStateFields = {
      currentPayloadSignature: 'current',
      lastPayloadSyncSignature: 'baseline',
      lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
      lastPayloadSyncMediaFingerprint: 'media',
      hasUnsyncedPayloadChanges: false,
    }

    expect(payloadSyncFieldsEqual(fields, { ...fields })).toBe(true)
    expect(
      payloadSyncFieldsEqual(fields, {
        ...fields,
        lastPayloadSyncMediaFingerprint: 'changed-media',
      }),
    ).toBe(false)
    expect(payloadSyncFieldsEqual({}, { hasUnsyncedPayloadChanges: false })).toBe(true)
  })
})

describe('Draft Payload Sync transitions', () => {
  it('clears sync metadata from drafts without default Payload identity', () => {
    const refreshed = refreshDraftPayloadSyncState<TestDraft>(
      {
        title: 'Draft',
        currentPayloadSignature: 'current',
        lastPayloadSyncSignature: 'baseline',
        lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
        lastPayloadSyncMediaFingerprint: 'media',
        hasUnsyncedPayloadChanges: true,
      },
      buildComparableShape,
    )

    expect(refreshed).toEqual({
      title: 'Draft',
      currentPayloadSignature: undefined,
      lastPayloadSyncSignature: undefined,
      lastPayloadSyncAt: undefined,
      lastPayloadSyncMediaFingerprint: undefined,
      hasUnsyncedPayloadChanges: false,
    })
  })

  it('refreshes signatures and preserves external media fingerprints', () => {
    const refreshed = refreshDraftPayloadSyncState<TestDraft>(
      {
        payloadId: 10,
        title: 'Changed title',
        lastPayloadSyncSignature: '{"title":"Original title"}',
        lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
        lastPayloadSyncMediaFingerprint: 'media',
      },
      buildComparableShape,
    )

    expect(refreshed).toMatchObject({
      currentPayloadSignature: '{"title":"Changed title"}',
      lastPayloadSyncSignature: '{"title":"Original title"}',
      lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
      lastPayloadSyncMediaFingerprint: 'media',
      hasUnsyncedPayloadChanges: true,
    })
  })

  it('can initialize a clean legacy draft baseline as synced', () => {
    const refreshed = refreshDraftPayloadSyncState<TestDraft>(
      {
        payloadId: 10,
        title: 'Current title',
        hasUnsyncedPayloadChanges: false,
      },
      buildComparableShape,
      {
        initializeMissingBaselineAsSynced: true,
      },
    )

    expect(refreshed.currentPayloadSignature).toBe('{"title":"Current title"}')
    expect(refreshed.lastPayloadSyncSignature).toBe(refreshed.currentPayloadSignature)
    expect(refreshed.hasUnsyncedPayloadChanges).toBe(false)
  })

  it('does not initialize a baseline over a stored dirty flag', () => {
    const refreshed = refreshDraftPayloadSyncState<TestDraft>(
      {
        payloadId: 10,
        title: 'Current title',
        hasUnsyncedPayloadChanges: true,
      },
      buildComparableShape,
      {
        initializeMissingBaselineAsSynced: true,
      },
    )

    expect(refreshed.lastPayloadSyncSignature).toBeUndefined()
    expect(refreshed.hasUnsyncedPayloadChanges).toBe(true)
  })

  it('supports feature-specific Payload identity', () => {
    const refreshed = refreshDraftPayloadSyncState<TestDraft>(
      {
        externalId: 'payload-10',
        title: 'Current title',
      },
      buildComparableShape,
      {
        hasPayloadIdentity: (draft) => Boolean(draft.externalId),
        missingBaselineIsUnsynced: true,
      },
    )

    expect(refreshed.currentPayloadSignature).toBe('{"title":"Current title"}')
    expect(refreshed.hasUnsyncedPayloadChanges).toBe(true)
  })

  it('marks an identified draft synced at one signature', () => {
    const synced = markDraftAsPayloadSynced<TestDraft>(
      {
        payloadId: 10,
        title: ' Current title ',
        lastPayloadSyncMediaFingerprint: 'media',
      },
      buildComparableShape,
      '2026-07-25T12:00:00.000Z',
    )

    expect(synced).toMatchObject({
      currentPayloadSignature: '{"title":"Current title"}',
      lastPayloadSyncSignature: '{"title":"Current title"}',
      lastPayloadSyncAt: '2026-07-25T12:00:00.000Z',
      lastPayloadSyncMediaFingerprint: 'media',
      hasUnsyncedPayloadChanges: false,
    })
  })

  it('marks an identified draft unsynced without replacing its baseline', () => {
    const unsynced = markDraftAsPayloadUnsynced<TestDraft>(
      {
        payloadId: 10,
        title: 'Changed title',
        lastPayloadSyncSignature: '{"title":"Original title"}',
        lastPayloadSyncMediaFingerprint: 'media',
      },
      buildComparableShape,
    )

    expect(unsynced).toMatchObject({
      currentPayloadSignature: '{"title":"Changed title"}',
      lastPayloadSyncSignature: '{"title":"Original title"}',
      lastPayloadSyncMediaFingerprint: 'media',
      hasUnsyncedPayloadChanges: true,
    })
  })

  it('strips legacy fields from a copy without mutating the draft', () => {
    const legacyDraft = {
      title: 'Draft',
      payloadSyncBaseline: 'baseline',
      hasLocalChanges: true,
    }

    expect(stripLegacyPayloadSyncFields(legacyDraft)).toEqual({
      title: 'Draft',
    })
    expect(legacyDraft).toEqual({
      title: 'Draft',
      payloadSyncBaseline: 'baseline',
      hasLocalChanges: true,
    })
  })
})
