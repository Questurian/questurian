import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../providers/useAuth'
import './homepageFeaturedContent.css'
import {
  fetchMainHomepage,
  updateMainHomepageBlock,
  addMainHomepageBlock,
  fetchHomepageFeaturedCandidates,
} from './api'
import HomepageFeaturedSlotEditor from './HomepageFeaturedSlotEditor'
import { useHomepageFeaturedSlots } from './useHomepageFeaturedSlots'
import type { FeaturedArticlesBlockResponse, PageBlockResponse } from './locationHomepagesApi'

type BlockEditorProps = {
  block: FeaturedArticlesBlockResponse
  blockIndex: number
  token: string | null
  canManage: boolean
  mainHomepageQueryKey: unknown[]
}

function MainFeaturedArticlesBlockEditor({
  block,
  blockIndex,
  token,
  canManage,
  mainHomepageQueryKey,
}: BlockEditorProps) {
  const queryClient = useQueryClient()
  const blockSelectionQueryKey = ['main-homepage-block', block.id, token]

  const slotEditorState = useHomepageFeaturedSlots({
    token,
    canManage,
    fetchSelection: () => Promise.resolve(block.selection),
    saveSelection: async (t, items) => {
      const updated = await updateMainHomepageBlock(t, block.id, items)
      const updatedBlock = updated.pageBlocks.find(
        (b): b is FeaturedArticlesBlockResponse =>
          b.id === block.id && b.blockType === 'featured-articles',
      )
      if (!updatedBlock) throw new Error('Block not found after save.')
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
      return updatedBlock.selection
    },
    fetchCandidates: (t, params) => fetchHomepageFeaturedCandidates(t, params),
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

export default function MainHomepagePage() {
  const { token, user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()
  const mainHomepageQueryKey = ['main-homepage', token]

  const homepageQuery = useQuery({
    queryKey: mainHomepageQueryKey,
    queryFn: () => fetchMainHomepage(token!),
    enabled: Boolean(token && canManage),
  })

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [addBlockStep, setAddBlockStep] = useState<AddBlockStep>('type')
  const [selectedSlotCount, setSelectedSlotCount] = useState(10)
  const [customSlotCount, setCustomSlotCount] = useState('')

  const addBlockMutation = useMutation({
    mutationFn: (slotCount: number) =>
      addMainHomepageBlock(token!, 'featured-articles', slotCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
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
          <h2>Main Homepage</h2>
          <p>Only admin and editor accounts can manage the homepage.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.isLoading) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching main homepage data.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.error || !homepageQuery.data) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Main Homepage</h2>
          <p>
            {homepageQuery.error instanceof Error
              ? homepageQuery.error.message
              : 'Failed to load main homepage.'}
          </p>
          <Link to="/homepage-featured-content" className="hf-btn-ghost" style={{ marginTop: '1rem' }}>
            Back to hub
          </Link>
        </div>
      </div>
    )
  }

  const homepage = homepageQuery.data

  return (
    <div className="hf-page">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="hf-detail-header">
        <div className="hf-detail-header-left">
          <Link to="/homepage-featured-content" className="hf-btn-ghost">
            ← Hub
          </Link>
          <div className="hf-detail-title-block">
            <h1>Main Homepage</h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
              domain.com
            </span>
          </div>
          <span className="hf-level-tag">global</span>
        </div>
        <span className="hf-enabled-tag on">Always active</span>
      </div>

      {/* ── Blocks ─────────────────────────────────────────── */}
      {homepage.pageBlocks.length === 0 ? (
        <div className="hf-state-screen">
          <h2>No blocks yet</h2>
          <p>
            The main homepage has no content blocks. Add a Featured Articles block to start
            curating.
          </p>
        </div>
      ) : (
        homepage.pageBlocks.map((block: PageBlockResponse, idx: number) => {
          if (block.blockType === 'featured-articles') {
            return (
              <MainFeaturedArticlesBlockEditor
                key={block.id}
                block={block as FeaturedArticlesBlockResponse}
                blockIndex={idx}
                token={token}
                canManage={canManage}
                mainHomepageQueryKey={mainHomepageQueryKey}
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
                <p>
                  Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in this
                  tool.
                </p>
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
            <button type="button" className="hf-btn-ghost" onClick={handleCancelAddBlock}>
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
