import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'
import {
  fetchLocationById,
  fetchMediaSetOptions,
  updateLocation,
} from '../api'
import { CoverImagePickerField } from '../components/CoverImagePickerField'
import {
  buildDraftFromPayloadDoc,
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  markDraftAsPayloadSynced,
  refreshDraftPayloadSyncState,
  validateDraft,
} from '../schema'
import { findDraftByDraftId, findDraftByPayloadId, saveDraft } from '../storage'
import { useBuilderAutosave } from '../../../shared/builder/hooks/useBuilderAutosave'
import type { LocationDocumentDraft, RelationshipFieldDefinition } from '../types'
import { formatMediaSetLabel } from '../utils'
import '../styles.css'

const COVER_IMAGE_FIELD: RelationshipFieldDefinition = {
  key: 'coverImage',
  label: 'Cover Image',
  type: 'relationship',
  relationTo: 'media-sets',
  optionSource: 'mediaSets',
  picker: 'mediaSetLibrary',
}

function formatDate(value?: string): string {
  if (!value) return 'Not synced yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLevelLabel(level: LocationDocumentDraft['level']): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

function normalizeDraftForEdit(draft: LocationDocumentDraft): LocationDocumentDraft {
  return refreshDraftPayloadSyncState(draft)
}

export default function LocationDocumentBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState<LocationDocumentDraft | null>(null)
  const [mediaSets, setMediaSets] = useState<Awaited<ReturnType<typeof fetchMediaSetOptions>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')
  const payloadId = payloadIdParam ? Number(payloadIdParam) : NaN

  useEffect(() => {

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setInitializationError(null)

    const loadDraft = async () => {
      try {
        if (draftIdParam) {
          const localDraft = findDraftByDraftId(draftIdParam)
          if (cancelled) return

          if (localDraft?.payloadId) {
            setDraft(normalizeDraftForEdit(localDraft))
            return
          }

          setDraft(null)
          setInitializationError('Open an existing Payload location from the list. This editor does not create new location records.')
          return
        }

        if (Number.isFinite(payloadId)) {
          const localDraft = findDraftByPayloadId(payloadId)
          if (localDraft) {
            if (cancelled) return
            setSearchParams({
              id: String(payloadId),
              draftId: localDraft.draftId,
            }, { replace: true })
            setDraft(normalizeDraftForEdit(localDraft))
            return
          }

          const payloadDoc = await fetchLocationById(payloadId)
          if (cancelled) return
          setDraft(normalizeDraftForEdit(buildDraftFromPayloadDoc(payloadDoc)))
          return
        }

        if (cancelled) return
        setDraft(null)
        setInitializationError('Open an existing Payload location from the list. This editor does not create new location records.')
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load location image editor'
        setError(message)
        setInitializationError(message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadDraft()

    return () => {
      cancelled = true
    }
  }, [draftIdParam, payloadId, setSearchParams])

  useEffect(() => {

    let cancelled = false
    setOptionsError(null)

    fetchMediaSetOptions()
      .then((options) => {
        if (!cancelled) setMediaSets(options)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMediaSets([])
          setOptionsError(err instanceof Error ? err.message : 'Failed to load media set options')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useBuilderAutosave(draft, saveDraft, 1200)

  useEffect(() => {
    if (!draft) return

    const refreshed = refreshDraftPayloadSyncState(draft)
    if (JSON.stringify(refreshed) !== JSON.stringify(draft)) {
      setDraft(refreshed)
    }
  }, [draft])

  const syncValidationError = draft ? validateDraft(draft) : null
  const requiresPayloadResync = Boolean(draft?.payloadId && draft.hasUnsyncedPayloadChanges)
  const headerTitle = useMemo(() => {
    if (!draft) return 'Location Image'
    return buildLocationHierarchyTitle(draft) || 'Location Image'
  }, [draft])
  const selectedMediaSet = useMemo(() => {
    if (!draft?.coverImage) return null
    return mediaSets.find((option) => option.id === draft.coverImage) || null
  }, [draft?.coverImage, mediaSets])

  const updateCoverImage = useCallback((value: number | null) => {
    setDraft((current) => {
      if (!current) return current
      return refreshDraftPayloadSyncState({
        ...current,
        coverImage: value,
        updatedAt: new Date().toISOString(),
      })
    })
  }, [])

  const handleSaveDraft = useCallback(() => {
    if (!draft) return
    const nextDraft = refreshDraftPayloadSyncState({
      ...draft,
      updatedAt: new Date().toISOString(),
    })
    setDraft(nextDraft)
    saveDraft(nextDraft)
    setResult('Saved local image changes in this browser.')
    setError(null)
  }, [draft])

  const handleSubmit = useCallback(async () => {
    if (!draft) return

    setIsSaving(true)
    setError(null)
    setResult(null)

    try {
      const validationError = validateDraft(draft)
      if (validationError) throw new Error(validationError)
      if (!draft.payloadId) {
        throw new Error('This editor only updates existing Payload location records.')
      }

      const payloadBody = buildPayloadLocationBody(draft)
      const savedDoc = await updateLocation(draft.payloadId, payloadBody)
      const syncedDraft = markDraftAsPayloadSynced(
        {
          ...buildDraftFromPayloadDoc(savedDoc),
          draftId: draft.draftId,
        },
        savedDoc.updatedAt || new Date().toISOString(),
      )

      setDraft(syncedDraft)
      saveDraft(syncedDraft)
      setSearchParams({
        id: String(savedDoc.id),
        draftId: syncedDraft.draftId,
      })
      setResult('Updated Payload location cover image.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save location cover image')
    } finally {
      setIsSaving(false)
    }
  }, [draft, setSearchParams])


  if (isLoading) {
    return (
      <div className="ldb-page">
        <section className="ldb-panel">
          <p className="ldb-placeholder">Loading location image editor...</p>
        </section>
      </div>
    )
  }

  if (!draft || initializationError) {
    return (
      <div className="ldb-page">
        <section className="ldb-panel">
          <div className="ldb-panel-header">
            <div>
              <h2>Location Image Unavailable</h2>
              <p>{initializationError || 'Open an existing Payload location from the list.'}</p>
            </div>
            <Link className="ldb-btn ldb-btn-secondary" to="/location-documents">
              Back to Locations
            </Link>
          </div>
          {error ? <p className="ldb-error">{error}</p> : null}
        </section>
      </div>
    )
  }

  return (
    <div className="ldb-builder-page">
      <header className="ldb-builder-hero">
        <div>
          <Link className="ldb-builder-back-link" to="/location-documents">
            Back to Location Images
          </Link>
          <p className="ldb-eyebrow">Payload Location</p>
          <div className="ldb-title-row">
            <h1>{headerTitle}</h1>
            <span className={`ldb-status-chip is-${draft.level}`}>
              {formatLevelLabel(draft.level)}
            </span>
          </div>
          <p className="ldb-lede">
            Manage the single top-level cover image relationship for this existing Payload location.
          </p>
        </div>

        <aside className="ldb-builder-actions-card">
          <div className="ldb-builder-actions-head">
            <img src={payloadLogoUrl} alt="" aria-hidden="true" />
            <div>
              <p className="ldb-builder-actions-kicker">Payload sync</p>
              <p className="ldb-builder-actions-copy">
                {requiresPayloadResync ? 'Local image changed.' : 'No local image changes.'}
              </p>
            </div>
          </div>
          <div className="ldb-builder-action-grid ldb-builder-action-grid--primary">
            <button type="button" className="ldb-btn ldb-btn-secondary" onClick={handleSaveDraft}>
              Save Local
            </button>
            <button
              type="button"
              className="ldb-btn"
              onClick={handleSubmit}
              disabled={Boolean(syncValidationError) || isSaving}
            >
              {isSaving ? (
                <>
                  <span className="ldb-spinner ldb-spinner--sm" aria-hidden="true" />
                  Syncing...
                </>
              ) : requiresPayloadResync ? 'Resync to Payload' : 'Sync to Payload'}
            </button>
          </div>
          <p className="ldb-builder-actions-note">
            Last Payload sync: {formatDate(draft.lastPayloadSyncAt)}
          </p>
          {syncValidationError ? (
            <p className="ldb-builder-actions-warning">{syncValidationError}</p>
          ) : null}
        </aside>
      </header>

      {error ? <p className="ldb-error">{error}</p> : null}
      {result ? <p className="ldb-success">{result}</p> : null}
      {optionsError ? <p className="ldb-error">{optionsError}</p> : null}

      <main className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>Cover Image</h2>
            <p>
              Stored on the location document as `coverImage`. Guide fields are no longer sent or edited here.
            </p>
          </div>
        </div>

        <div className="ldb-field-grid">
          <div className="ldb-field">
            <span className="ldb-label">Location key</span>
            <input className="ldb-input" value={draft.locationKey || ''} readOnly />
          </div>
          <div className="ldb-field">
            <span className="ldb-label">Parent key</span>
            <input className="ldb-input" value={draft.parentKey || ''} readOnly />
          </div>
          <div className="ldb-field">
            <span className="ldb-label">Country</span>
            <input className="ldb-input" value={draft.countryName || draft.country} readOnly />
          </div>
          <div className="ldb-field">
            <span className="ldb-label">City</span>
            <input className="ldb-input" value={draft.cityName || draft.city || 'None'} readOnly />
          </div>
          <div className="ldb-field">
            <span className="ldb-label">Neighborhood</span>
            <input className="ldb-input" value={draft.neighborhoodName || draft.neighborhood || 'None'} readOnly />
          </div>
          <div className="ldb-field">
            <span className="ldb-label">Selected media set</span>
            <input
              className="ldb-input"
              value={selectedMediaSet ? formatMediaSetLabel(selectedMediaSet) : draft.coverImage ? `Media set #${draft.coverImage}` : 'None'}
              readOnly
            />
          </div>
        </div>

        <CoverImagePickerField
          field={COVER_IMAGE_FIELD}
          value={draft.coverImage}
          locationRef={draft.payloadId ?? null}
          mediaSets={mediaSets}
          onValueChange={updateCoverImage}
        />
      </main>
    </div>
  )
}
