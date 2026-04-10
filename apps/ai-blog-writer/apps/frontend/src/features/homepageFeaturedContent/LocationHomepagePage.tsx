import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../providers/useAuth'
import './homepageFeaturedContent.css'
import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import {
  addLocationHomepageBlock,
  fetchLocationHomepage,
  fetchLocationHomepageCandidates,
  toggleLocationHomepage,
  updateLocationHomepageBlock,
  type FeaturedArticlesBlockResponse,
  type LocationRef,
} from './locationHomepagesApi'
import { useHomepageFeaturedSlots } from './useHomepageFeaturedSlots'

function getLocationLabel(location: LocationRef | null): string {
  if (!location) return 'Location Homepage'

  if (location.neighborhoodName) {
    return `${location.neighborhoodName}${location.cityName ? `, ${location.cityName}` : ''}`
  }

  if (location.cityName) return location.cityName

  return location.countryName ?? 'Location Homepage'
}

type BlockEditorProps = {
  block: FeaturedArticlesBlockResponse
  blockIndex: number
  homepageId: number
  token: string | null
  canManage: boolean
}

function FeaturedArticlesBlockEditor({
  block,
  blockIndex,
  homepageId,
  token,
  canManage,
}: BlockEditorProps) {
  const queryClient = useQueryClient()
  const blockSelectionQueryKey = ['location-homepage-block', homepageId, block.id, token]

  const slotEditorState = useHomepageFeaturedSlots({
    token,
    canManage,
    fetchSelection: () => Promise.resolve(block.selection),
    saveSelection: async (t, items) => {
      const updated = await updateLocationHomepageBlock(t, homepageId, block.id, items)
      const updatedBlock = updated.pageBlocks.find(
        (b): b is FeaturedArticlesBlockResponse =>
          b.id === block.id && b.blockType === 'featured-articles',
      )
      if (!updatedBlock) throw new Error('Block not found after save.')
      queryClient.invalidateQueries({ queryKey: ['location-homepage', homepageId, token] })
      return updatedBlock.selection
    },
    fetchCandidates: (t, params) =>
      fetchLocationHomepageCandidates(
        t,
        homepageId,
        params as Parameters<typeof fetchLocationHomepageCandidates>[2],
      ),
    selectionQueryKey: blockSelectionQueryKey,
  })

  const totalSlots = block.selection.totalSlots

  return (
    <div className="hf-block-section">
      <div className="hf-block-header">
        <div className="hf-block-label">
          <span>Block {blockIndex + 1}</span>
          <span className="hf-block-type-tag">featured-articles · {totalSlots} slots</span>
        </div>
      </div>
      <div className="hf-block-content">
        <HomepageFeaturedSlotEditor
          pageTitle=""
          slotEditorState={slotEditorState}
          compact
        />
      </div>
    </div>
  )
}

type AddBlockStep = 'type' | 'options'

const QUICK_SLOT_COUNTS = [1, 4, 6, 10]

export default function LocationHomepagePage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const { token, user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()
  const homepageQueryKey = ['location-homepage', numericId, token]

  const homepageQuery = useQuery({
    queryKey: homepageQueryKey,
    queryFn: () => fetchLocationHomepage(token!, numericId),
    enabled: Boolean(token && canManage && numericId),
  })

  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (homepageQuery.data && isEnabled === null) {
      setIsEnabled(homepageQuery.data.isEnabled)
    }
  }, [homepageQuery.data, isEnabled])

  const toggleMutation = useMutation({
    mutationFn: () => toggleLocationHomepage(token!, numericId),
    onSuccess: (result) => {
      setIsEnabled(result.isEnabled)
      queryClient.invalidateQueries({ queryKey: ['location-homepages-list'] })
    },
  })

  // ── Add Block UI state ────────────────────────────────────────────────
  const [showAddBlock, setShowAddBlock] = useState(false)
  const [addBlockStep, setAddBlockStep] = useState<AddBlockStep>('type')
  const [selectedSlotCount, setSelectedSlotCount] = useState(10)
  const [customSlotCount, setCustomSlotCount] = useState('')

  const addBlockMutation = useMutation({
    mutationFn: (slotCount: number) =>
      addLocationHomepageBlock(token!, numericId, 'featured-articles', slotCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
      setShowAddBlock(false)
      setAddBlockStep('type')
      setSelectedSlotCount(10)
      setCustomSlotCount('')
    },
  })

  function handleConfirmAddBlock() {
    const count = customSlotCount.trim()
      ? Math.max(1, Math.min(100, Math.trunc(Number(customSlotCount))))
      : selectedSlotCount
    if (!count || count < 1) return
    addBlockMutation.mutate(count)
  }

  function handleCancelAddBlock() {
    setShowAddBlock(false)
    setAddBlockStep('type')
    setSelectedSlotCount(10)
    setCustomSlotCount('')
  }

  if (!canManage) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Location Homepage</h2>
          <p>Only admin and editor accounts can manage location homepages.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.isLoading) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching homepage data from Payload.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.error || !homepageQuery.data) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Location Homepage</h2>
          <p>
            {homepageQuery.error instanceof Error
              ? homepageQuery.error.message
              : 'Failed to load location homepage.'}
          </p>
          <Link to="/homepage-featured-content" className="hf-btn-ghost" style={{ marginTop: '1rem' }}>
            Back to hub
          </Link>
        </div>
      </div>
    )
  }

  const homepage = homepageQuery.data
  const locationLabel = getLocationLabel(homepage.location)
  const enabledState = isEnabled ?? homepage.isEnabled

  return (
    <div className="hf-page">
      {/* ── Detail header ──────────────────────────────────── */}
      <div className="hf-detail-header">
        <div className="hf-detail-header-left">
          <Link to="/homepage-featured-content" className="hf-btn-ghost">
            ← Hub
          </Link>
          <div className="hf-detail-title-block">
            <h1>{locationLabel}</h1>
            {homepage.location?.locationKey && (
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                {homepage.location.locationKey}
              </span>
            )}
          </div>
          <span className={`hf-level-tag`}>{homepage.location?.level ?? 'location'}</span>
        </div>

        <button
          type="button"
          className={`hf-toggle-btn ${enabledState ? 'on' : 'off'}`}
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {toggleMutation.isPending
            ? 'Updating…'
            : enabledState
              ? '● Enabled'
              : '○ Disabled'}
        </button>
      </div>

      {/* ── Blocks ─────────────────────────────────────────── */}
      {homepage.pageBlocks.length === 0 ? (
        <div className="hf-state-screen">
          <h2>No blocks yet</h2>
          <p>
            This homepage has no content blocks. Add a Featured Articles block to start curating.
          </p>
        </div>
      ) : (
        homepage.pageBlocks.map((block, idx) => {
          if (block.blockType === 'featured-articles') {
            return (
              <FeaturedArticlesBlockEditor
                key={block.id}
                block={block as FeaturedArticlesBlockResponse}
                blockIndex={idx}
                homepageId={numericId}
                token={token}
                canManage={canManage}
              />
            )
          }
          return (
            <div key={block.id} className="hf-block-section">
              <div className="hf-block-header">
                <div className="hf-block-label">
                  <span>Block {idx + 1}</span>
                  <span className="hf-block-type-tag">{block.blockType}</span>
                </div>
              </div>
              <div className="hf-block-content hf-empty">
                <p>Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in this tool.</p>
              </div>
            </div>
          )
        })
      )}

      {/* ── Add block ──────────────────────────────────────── */}
      <div className="hf-add-block-row">
        {!showAddBlock ? (
          <button
            type="button"
            className="hf-btn-ghost"
            onClick={() => setShowAddBlock(true)}
          >
            + Add Block
          </button>
        ) : addBlockStep === 'type' ? (
          <div className="hf-add-block-picker">
            <p className="hf-add-block-prompt">Choose a block type:</p>
            <button
              type="button"
              className="hf-block-type-option"
              onClick={() => setAddBlockStep('options')}
            >
              <strong>Featured Articles</strong>
              <span>A curated list of articles in fixed slots</span>
            </button>
            <button
              type="button"
              className="hf-btn-ghost"
              onClick={handleCancelAddBlock}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="hf-add-block-picker">
            <p className="hf-add-block-prompt">How many article slots?</p>
            <div className="hf-add-block-counts">
              {QUICK_SLOT_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`hf-btn-ghost${selectedSlotCount === n && !customSlotCount.trim() ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedSlotCount(n)
                    setCustomSlotCount('')
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                className="hf-slot-count-input"
                min={1}
                max={100}
                placeholder="Custom…"
                value={customSlotCount}
                onChange={(e) => setCustomSlotCount(e.target.value)}
              />
            </div>
            <div className="hf-add-block-actions">
              <button
                type="button"
                className="hf-btn-ghost"
                onClick={() => setAddBlockStep('type')}
              >
                ← Back
              </button>
              <button
                type="button"
                className="hf-btn-primary"
                onClick={handleConfirmAddBlock}
                disabled={addBlockMutation.isPending}
              >
                {addBlockMutation.isPending ? 'Adding…' : 'Add Block'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
