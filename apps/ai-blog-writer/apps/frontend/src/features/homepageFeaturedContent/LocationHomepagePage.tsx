import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../providers/useAuth'
import './homepageFeaturedContent.css'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import {
  addLocationHomepageBlock,
  deleteLocationHomepageBlock,
  fetchLocationHomepage,
  fetchLocationHomepageCandidates,
  fetchLocationHomepageHotelGridCandidates,
  fetchLocationHomepageLocationGridCandidates,
  fetchLocationHomepageWhereToEatDrinkCandidates,
  toggleLocationHomepage,
  updateLocationHomepageBlock,
  type LocationRef,
} from './locationHomepagesApi'
import {
  HOMEPAGE_PAGE_BLOCK_TYPES,
  isHotelGridBlock,
  isArticleCuratedHomepageBlock,
  isLocationGridBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelGridBlockResponse,
  type LocationGridBlockResponse,
} from './pageBlocks'

function getLocationLabel(location: LocationRef | null): string {
  if (!location) return 'Location Homepage'

  if (location.neighborhoodName) {
    return `${location.neighborhoodName}${location.cityName ? `, ${location.cityName}` : ''}`
  }

  if (location.cityName) return location.cityName

  return location.countryName ?? 'Location Homepage'
}

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

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null)

  const addBlockMutation = useMutation({
    mutationFn: ({
      blockType,
      slotCount,
    }: {
      blockType: CuratedHomepageBlockType
      slotCount: number
    }) => addLocationHomepageBlock(token!, numericId, blockType, slotCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
      setShowAddBlock(false)
    },
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteLocationHomepageBlock(token!, numericId, blockId),
    onMutate: ({ blockId }) => {
      setDeletingBlockId(blockId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
    },
    onSettled: () => {
      setDeletingBlockId(null)
    },
  })

  function handleConfirmAddBlock(blockType: CuratedHomepageBlockType, slotCount: number) {
    addBlockMutation.mutate({ blockType, slotCount })
  }

  const deleteError = deleteBlockMutation.isError
    ? (deleteBlockMutation.error instanceof Error ? deleteBlockMutation.error.message : 'Failed to delete block.')
    : null

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
  const locationGridChildLevel = homepage.location?.level === 'city' ? 'neighborhood' : null
  const availableBlockTypes = locationGridChildLevel
    ? HOMEPAGE_PAGE_BLOCK_TYPES
    : HOMEPAGE_PAGE_BLOCK_TYPES.filter((blockType) => blockType !== 'location-grid')

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
            This homepage has no content blocks. Add a content block to start curating.
          </p>
        </div>
      ) : (
        homepage.pageBlocks.map((block, idx) => {
          if (isArticleCuratedHomepageBlock(block)) {
            return (
              <CuratedHomepageBlockEditor
                key={block.id}
                block={block}
                blockIndex={idx}
                token={token}
                canManage={canManage}
                onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                selectionQueryKey={['location-homepage-block', numericId, block.id, token]}
                saveSelection={async (currentToken, items) => {
                  const updated = await updateLocationHomepageBlock(
                    currentToken,
                    numericId,
                    block.id,
                    items,
                  )
                  const updatedBlock = updated.pageBlocks.find(
                    (candidate): candidate is ArticleCuratedHomepageBlockResponse =>
                      candidate.id === block.id && candidate.blockType === block.blockType,
                  )
                  if (!updatedBlock) throw new Error('Block not found after save.')
                  queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  return updatedBlock.selection
                }}
                fetchCandidates={(currentToken, params) =>
                  block.blockType === 'where-to-eat-drink'
                    ? fetchLocationHomepageWhereToEatDrinkCandidates(currentToken, numericId, params)
                    : fetchLocationHomepageCandidates(
                      currentToken,
                      numericId,
                      params as Parameters<typeof fetchLocationHomepageCandidates>[2],
                    )}
              />
            )
          }
          if (isLocationGridBlock(block) && locationGridChildLevel) {
            return (
              <LocationGridBlockEditor
                key={block.id}
                block={block}
                blockIndex={idx}
                token={token}
                canManage={canManage}
                onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                childLevel={locationGridChildLevel}
                selectionQueryKey={['location-homepage-location-grid', numericId, block.id, token]}
                saveSelection={async (currentToken, items) => {
                  const updated = await updateLocationHomepageBlock(
                    currentToken,
                    numericId,
                    block.id,
                    items,
                  )
                  const updatedBlock = updated.pageBlocks.find(
                    (candidate): candidate is LocationGridBlockResponse =>
                      candidate.id === block.id && candidate.blockType === block.blockType,
                  )
                  if (!updatedBlock) throw new Error('Block not found after save.')
                  queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  return updatedBlock.selection
                }}
                fetchCandidates={(currentToken, params) =>
                  fetchLocationHomepageLocationGridCandidates(currentToken, numericId, params)}
              />
            )
          }
          if (isHotelGridBlock(block)) {
            return (
              <HotelGridBlockEditor
                key={block.id}
                block={block}
                blockIndex={idx}
                token={token}
                canManage={canManage}
                onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                selectionQueryKey={['location-homepage-hotel-grid', numericId, block.id, token]}
                saveSelection={async (currentToken, items) => {
                  const updated = await updateLocationHomepageBlock(
                    currentToken,
                    numericId,
                    block.id,
                    items,
                  )
                  const updatedBlock = updated.pageBlocks.find(
                    (candidate): candidate is HotelGridBlockResponse =>
                      candidate.id === block.id && candidate.blockType === block.blockType,
                  )
                  if (!updatedBlock) throw new Error('Block not found after save.')
                  queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  return updatedBlock.selection
                }}
                fetchCandidates={(currentToken, params) =>
                  fetchLocationHomepageHotelGridCandidates(currentToken, numericId, params)}
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
                <HomepageBlockDeleteTrigger
                  blockId={block.id}
                  blockIndex={idx}
                  blockLabel={block.blockType}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                />
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
        ) : (
          <AddHomepageBlockPicker
            isPending={addBlockMutation.isPending}
            onConfirm={handleConfirmAddBlock}
            onCancel={() => setShowAddBlock(false)}
            availableBlockTypes={availableBlockTypes}
          />
        )}
      </div>
    </div>
  )
}
