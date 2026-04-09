import { useDeferredValue, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { useAuth } from '../../providers/useAuth'
import {
  fetchHomepageFeaturedCandidates,
  fetchHomepageFeaturedSelection,
  saveHomepageFeaturedSelection,
} from './api'
import './homepageFeaturedContent.css'
import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCollection,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'
import {
  HOMEPAGE_FEATURED_TOTAL_SLOTS,
} from './types'

const CANDIDATE_PAGE_SIZE = 24

type SlotValue = HomepageFeaturedCandidate | null

function createEmptySlots(): SlotValue[] {
  return Array.from({ length: HOMEPAGE_FEATURED_TOTAL_SLOTS }, () => null)
}

function mapSelectionToSlots(selection: HomepageFeaturedSelection): SlotValue[] {
  const slots = createEmptySlots()

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

function areRefsEqual(left: SlotValue, right: SlotValue): boolean {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.id === right.id && left.relationTo === right.relationTo
}

function areSlotListsEqual(left: SlotValue[] | null, right: SlotValue[]): boolean {
  if (!left) return false

  return left.length === right.length && left.every((item, index) => areRefsEqual(item, right[index]))
}

function hasDuplicateSlots(slots: SlotValue[]): boolean {
  const keys = new Set<string>()

  for (const item of slots) {
    if (!item) continue

    const key = `${item.relationTo}:${item.id}`
    if (keys.has(key)) return true
    keys.add(key)
  }

  return false
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown'

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInvalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') {
    return 'Previously saved draft is no longer eligible.'
  }

  if (item.reason === 'not_found') {
    return 'Previously saved item could not be loaded.'
  }

  return 'Saved slot contains an invalid reference.'
}

function getCollectionOptions(): Array<{ value: HomepageFeaturedCollection | 'all'; label: string }> {
  return [
    { value: 'all', label: 'All article types' },
    { value: 'articles', label: 'Standard Articles' },
    { value: 'single-type-listicles', label: 'Single Type Listicles' },
    { value: 'listicle-itineraries', label: 'Listicle Itineraries' },
  ]
}

function buildSaveItems(slots: SlotValue[]): HomepageFeaturedItemRef[] {
  return slots.flatMap((item) => {
    if (!item) return []

    return [{
      relationTo: item.relationTo,
      id: item.id,
    }]
  })
}

function findFirstEmptySlot(slots: SlotValue[]): number {
  return slots.findIndex((item) => item === null)
}

export default function HomepageFeaturedContentPage() {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [collectionFilter, setCollectionFilter] = useState<HomepageFeaturedCollection | 'all'>('all')
  const [candidatePage, setCandidatePage] = useState(1)
  const [draftSlots, setDraftSlots] = useState<SlotValue[] | null>(null)
  const [savedSlots, setSavedSlots] = useState<SlotValue[]>(createEmptySlots())
  const [savedInvalidItems, setSavedInvalidItems] = useState<HomepageFeaturedInvalidItem[]>([])
  const [replaceSlotIndex, setReplaceSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const selectionQueryKey = ['homepage-featured-selection', token]

  const selectionQuery = useQuery({
    queryKey: selectionQueryKey,
    queryFn: () => fetchHomepageFeaturedSelection(token!),
    enabled: Boolean(token && canManage),
  })

  useEffect(() => {
    if (!selectionQuery.data || draftSlots !== null) return

    const nextSlots = mapSelectionToSlots(selectionQuery.data)
    setSavedSlots(nextSlots)
    setDraftSlots(nextSlots)
    setSavedInvalidItems(selectionQuery.data.invalidItems)
  }, [draftSlots, selectionQuery.data])

  useEffect(() => {
    setCandidatePage(1)
  }, [collectionFilter, deferredSearchValue])

  const candidatesQuery = useQuery({
    queryKey: ['homepage-featured-candidates', token, collectionFilter, deferredSearchValue, candidatePage],
    queryFn: () =>
      fetchHomepageFeaturedCandidates(token!, {
        type: collectionFilter,
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE,
      }),
    enabled: Boolean(token && canManage),
    placeholderData: (previousData) => previousData,
  })

  const saveMutation = useMutation({
    mutationFn: (items: HomepageFeaturedItemRef[]) => saveHomepageFeaturedSelection(token!, items),
    onSuccess: (selection) => {
      const nextSlots = mapSelectionToSlots(selection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(selection.invalidItems)
      setReplaceSlotIndex(null)
      setResultMessage('Homepage featured content saved.')
      queryClient.setQueryData(selectionQueryKey, selection)
    },
    onError: (error: unknown) => {
      setResultMessage(error instanceof Error ? error.message : 'Failed to save homepage featured content.')
    },
  })

  const slots = draftSlots ?? savedSlots
  const firstEmptySlotIndex = findFirstEmptySlot(slots)
  const usedKeys = new Set(
    slots.flatMap((item) => (item ? [`${item.relationTo}:${item.id}`] : [])),
  )
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const saveDisabled =
    !token
    || !hasAllSlotsFilled
    || hasDuplicateSlots(slots)
    || saveMutation.isPending
    || !hasUnsavedChanges

  const invalidItemsBySlot = new Map<number, HomepageFeaturedInvalidItem>()
  for (const item of savedInvalidItems) {
    invalidItemsBySlot.set(item.slot, item)
  }

  const loadError = selectionQuery.error instanceof Error ? selectionQuery.error.message : null
  const candidateError = candidatesQuery.error instanceof Error ? candidatesQuery.error.message : null

  const selectionStatusPill = selectionQuery.data?.isComplete
    ? { className: 'success', label: 'Saved selection complete' }
    : { className: 'warning', label: 'Saved selection needs attention' }

  function updateSlots(transform: (current: SlotValue[]) => SlotValue[]) {
    setDraftSlots((current) => {
      const base = current ?? savedSlots
      return transform([...base])
    })
    setResultMessage(null)
  }

  function handleCandidatePick(candidate: HomepageFeaturedCandidate) {
    if (replaceSlotIndex === null && firstEmptySlotIndex === -1) {
      setResultMessage('All 10 slots are filled. Choose Replace on a slot to swap an item.')
      return
    }

    updateSlots((current) => {
      const next = [...current]

      if (replaceSlotIndex !== null) {
        next[replaceSlotIndex] = candidate
        return next
      }

      if (firstEmptySlotIndex >= 0) {
        next[firstEmptySlotIndex] = candidate
      }

      return next
    })

    setReplaceSlotIndex(null)
  }

  function handleMove(slotIndex: number, direction: -1 | 1) {
    updateSlots((current) => {
      const nextIndex = slotIndex + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current

      const next = [...current]
      const currentValue = next[slotIndex]
      next[slotIndex] = next[nextIndex]
      next[nextIndex] = currentValue
      return next
    })
  }

  function handleRemove(slotIndex: number) {
    updateSlots((current) => {
      const next = [...current]
      next[slotIndex] = null
      return next
    })

    if (replaceSlotIndex === slotIndex) {
      setReplaceSlotIndex(null)
    }
  }

  function handleReset() {
    setDraftSlots([...savedSlots])
    setReplaceSlotIndex(null)
    setResultMessage('Local changes discarded. Restored saved homepage selection.')
  }

  function handleSave() {
    if (saveDisabled) return
    saveMutation.mutate(buildSaveItems(slots))
  }

  if (!canManage) {
    return (
      <div className="homepage-featured-page">
        <div className="homepage-featured-denied">
          <h1>Homepage Featured Content</h1>
          <p>Only admin and editor accounts can manage the homepage top 10.</p>
        </div>
      </div>
    )
  }

  if (selectionQuery.isLoading && draftSlots === null) {
    return (
      <div className="homepage-featured-page">
        <div className="homepage-featured-loading">
          <h1>Loading homepage featured content…</h1>
          <p>Fetching the saved slot order and candidate rules from Payload.</p>
        </div>
      </div>
    )
  }

  if (loadError && draftSlots === null) {
    return (
      <div className="homepage-featured-page">
        <div className="homepage-featured-denied">
          <h1>Homepage Featured Content</h1>
          <p>{loadError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="homepage-featured-page">
      <header className="homepage-featured-hero">
        <div className="homepage-featured-hero-copy">
          <p className="homepage-featured-kicker">Structured Publishing</p>
          <h1>Homepage Featured Content</h1>
          <p>
            Curate the exact 10 content slots used by the front page. Add, replace,
            reorder, and save only when every slot is filled with a unique entry.
          </p>
        </div>
        <div className="homepage-featured-hero-meta">
          <span className={`homepage-featured-meta-pill ${selectionStatusPill.className}`}>
            {selectionStatusPill.label}
          </span>
          <span className="homepage-featured-meta-pill">
            Drafts {selectionQuery.data?.allowDrafts ? 'allowed' : 'blocked'}
          </span>
          <span className={`homepage-featured-meta-pill ${hasAllSlotsFilled ? 'success' : 'warning'}`}>
            {slots.filter(Boolean).length} / {HOMEPAGE_FEATURED_TOTAL_SLOTS} slots filled
          </span>
          <span className={`homepage-featured-meta-pill ${hasUnsavedChanges ? 'danger' : 'success'}`}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
          </span>
        </div>
      </header>

      {savedInvalidItems.length > 0 ? (
        <div className="homepage-featured-banner warning">
          {savedInvalidItems.length === 1
            ? 'One saved slot is no longer eligible. Replace it before saving again.'
            : `${savedInvalidItems.length} saved slots are no longer eligible. Replace them before saving again.`}
        </div>
      ) : null}

      {resultMessage ? (
        <div className={`homepage-featured-banner ${saveMutation.isError ? 'warning' : 'success'}`}>
          {resultMessage}
        </div>
      ) : null}

      <div className="homepage-featured-grid">
        <section className="homepage-featured-panel">
          <div className="homepage-featured-panel-header">
            <div>
              <h2>Top 10 Slots</h2>
              <p>Fixed positions for the front page. Use Replace to target one slot directly.</p>
            </div>
            <div className="homepage-featured-panel-actions">
              <button
                type="button"
                className="homepage-featured-ghost-btn"
                onClick={handleReset}
                disabled={!hasUnsavedChanges}
              >
                Reset / Discard
              </button>
              <button
                type="button"
                className="payload-action-btn"
                onClick={handleSave}
                disabled={saveDisabled}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save homepage top 10'}
              </button>
            </div>
          </div>

          <div className="homepage-featured-slot-list">
            {slots.map((item, slotIndex) => {
              const invalidItem = invalidItemsBySlot.get(slotIndex + 1)
              const isReplacing = replaceSlotIndex === slotIndex

              return (
                <article
                  key={`homepage-slot-${slotIndex + 1}`}
                  className={`homepage-featured-slot ${isReplacing ? 'replacing' : ''}`}
                >
                  <span className="homepage-featured-slot-index">{slotIndex + 1}</span>

                  <div className="homepage-featured-slot-body">
                    {item ? (
                      <>
                        <div className="homepage-featured-slot-meta">
                          <span>{item.collectionLabel}</span>
                          <span>{item.status || 'Unknown status'}</span>
                          <span>Updated {formatDate(item.updatedAt)}</span>
                        </div>
                        <h3 className="homepage-featured-slot-title">{item.title}</h3>
                        <p className="homepage-featured-slot-detail">
                          {item.slug ? `/${item.slug}` : 'No slug'} · Payload #{item.id}
                        </p>
                      </>
                    ) : (
                      <div className="homepage-featured-slot-empty">
                        <strong>Empty slot</strong>
                        <p className="homepage-featured-slot-detail">
                          {invalidItem ? getInvalidMessage(invalidItem) : 'Pick a candidate to fill this position.'}
                        </p>
                        {invalidItem ? (
                          <p className="homepage-featured-slot-warning">
                            Slot {invalidItem.slot} needs replacement before saving.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="homepage-featured-slot-actions">
                    <button
                      type="button"
                      className="homepage-featured-slot-btn"
                      onClick={() => setReplaceSlotIndex(isReplacing ? null : slotIndex)}
                    >
                      {isReplacing ? 'Cancel replace' : 'Replace'}
                    </button>
                    <button
                      type="button"
                      className="homepage-featured-slot-btn"
                      onClick={() => handleMove(slotIndex, -1)}
                      disabled={slotIndex === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="homepage-featured-slot-btn"
                      onClick={() => handleMove(slotIndex, 1)}
                      disabled={slotIndex === slots.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="homepage-featured-slot-btn"
                      onClick={() => handleRemove(slotIndex)}
                      disabled={!item && !invalidItem}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="homepage-featured-panel">
          <div className="homepage-featured-panel-header">
            <div>
              <h2>Payload Candidates</h2>
              <p>Search live Payload content and add it directly into the homepage set.</p>
            </div>
          </div>

          <div className="homepage-featured-controls">
            <label className="homepage-featured-search">
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search title or slug"
                aria-label="Search homepage featured candidates"
              />
            </label>

            <label className="homepage-featured-filter">
              <select
                value={collectionFilter}
                onChange={(event) => setCollectionFilter(event.target.value as HomepageFeaturedCollection | 'all')}
                aria-label="Filter candidate content type"
              >
                {getCollectionOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {replaceSlotIndex !== null ? (
            <div className="homepage-featured-replace-note">
              Replace mode is active for slot {replaceSlotIndex + 1}. Click a candidate below to swap it in.
            </div>
          ) : null}

          {candidateError ? (
            <div className="homepage-featured-empty">
              <p>{candidateError}</p>
            </div>
          ) : candidatesQuery.isLoading && !candidatesQuery.data ? (
            <div className="homepage-featured-empty">
              <p>Loading candidates…</p>
            </div>
          ) : candidatesQuery.data && candidatesQuery.data.docs.length > 0 ? (
            <>
              <div className="homepage-featured-candidate-list">
                {candidatesQuery.data.docs.map((candidate) => {
                  const candidateKey = `${candidate.relationTo}:${candidate.id}`
                  const isUsedInCurrentSlots = usedKeys.has(candidateKey)
                  const slotAlreadyContainsCandidate = replaceSlotIndex !== null
                    && slots[replaceSlotIndex]?.id === candidate.id
                    && slots[replaceSlotIndex]?.relationTo === candidate.relationTo
                  const isDisabled = isUsedInCurrentSlots && !slotAlreadyContainsCandidate
                  const actionLabel = replaceSlotIndex !== null
                    ? `Replace slot ${replaceSlotIndex + 1}`
                    : firstEmptySlotIndex >= 0
                      ? `Add to slot ${firstEmptySlotIndex + 1}`
                      : 'Selection full'

                  return (
                    <article key={candidateKey} className="homepage-featured-candidate">
                      <div className="homepage-featured-candidate-header">
                        <div>
                          <h3>{candidate.title}</h3>
                          <div className="homepage-featured-candidate-meta">
                            <span>{candidate.collectionLabel}</span>
                            <span>{candidate.status || 'Unknown status'}</span>
                            <span>Updated {formatDate(candidate.updatedAt)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="payload-action-btn"
                          onClick={() => handleCandidatePick(candidate)}
                          disabled={isDisabled || (replaceSlotIndex === null && firstEmptySlotIndex === -1)}
                        >
                          {isDisabled ? 'Already selected' : actionLabel}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="homepage-featured-pagination">
                <button
                  type="button"
                  onClick={() => setCandidatePage((current) => Math.max(1, current - 1))}
                  disabled={candidatePage <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {candidatesQuery.data.page} of {candidatesQuery.data.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCandidatePage((current) => Math.min(candidatesQuery.data?.totalPages || current, current + 1))}
                  disabled={candidatePage >= (candidatesQuery.data.totalPages || 1)}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="homepage-featured-empty">
              <p>No candidates matched the current filters.</p>
            </div>
          )}
        </section>
      </div>

      <div className="homepage-featured-banner">
        Need a different article? Use <Link to="/single-type-listicles">Single Type Listicles</Link>,{' '}
        <Link to="/listicle-itineraries">Listicle Itineraries</Link>, or the standard article staging flow,
        then come back here to feature it.
      </div>
    </div>
  )
}
