import { Link, useParams } from 'react-router-dom'

import { useAuth, usePermissions } from '../auth'
import './homepageFeaturedContent.css'
import HomepageBlocksSortableList from './HomepageBlocksSortableList'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import PublishedHomepagePreview from './PublishedHomepagePreview'
import HomepageDraftPublishSummary from './HomepageDraftPublishSummary'
import LocationHomepageBlockRenderer from './LocationHomepageBlockRenderer'
import { locationHomepageBlockKey } from './locationHomepageBlockKey'
import { useLocationHomepageEditor } from './useLocationHomepageEditor'
import { getLocationLabel } from './locationHomepagePage.utils'
import {
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  type PageBlockResponse
} from './pageBlocks'

export default function LocationHomepagePage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const { canManagePublished: canManage } = usePermissions()
  const { user } = useAuth()

  const {
    homepageQuery,
    isEnabled,
    toggleMutation,
    publishMutation,
    showAddBlock,
    setShowAddBlock,
    viewMode,
    setViewMode,
    deletingBlockId,
    pageBlockSlotKeys,
    handleSlotsChange,
    addBlockMutation,
    deleteBlockMutation,
    reorderBlocksMutation,
    handleConvertBlock,
    handleConfirmAddBlock,
    deleteError,
    invalidateHomepage
  } = useLocationHomepageEditor(numericId, canManage, user?.id)

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
          <Link
            to="/homepage-featured-content"
            className="hf-btn-ghost"
            style={{ marginTop: '1rem' }}
          >
            Back to hub
          </Link>
        </div>
      </div>
    )
  }

  const homepage = homepageQuery.data
  const locationLabel = getLocationLabel(homepage.location)
  const enabledState = isEnabled ?? homepage.isEnabled
  const locationGridChildLevel =
    homepage.location?.level === 'city' ? 'neighborhood' : null
  const availableBlockTypes = locationGridChildLevel
    ? HOMEPAGE_PAGE_BLOCK_TYPES
    : HOMEPAGE_PAGE_BLOCK_TYPES.filter(
        (blockType) => blockType !== 'location-grid'
      )

  const convertEmptyFeaturedArticlesTargets =
    CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES.filter((t) =>
      availableBlockTypes.includes(t)
    )

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
          </div>
        </div>

        <div className="hf-detail-header-center">
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

        <div className="hf-detail-header-actions">
          <div
            className="hf-view-mode-group"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('draft')}
              className={viewMode === 'draft' ? 'active' : undefined}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setViewMode('published')}
              disabled={
                !homepage.publishedPageBlocks ||
                homepage.publishedPageBlocks.length === 0
              }
              title={
                homepage.publishedPageBlocks &&
                homepage.publishedPageBlocks.length > 0
                  ? 'View the published page (read-only)'
                  : 'Nothing published yet'
              }
              className={viewMode === 'published' ? 'active' : undefined}
            >
              Published
            </button>
          </div>
          <button
            type="button"
            className="hf-btn-primary"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending}
            title="Publish the full homepage draft after validation."
          >
            {publishMutation.isPending ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
      {publishMutation.isError && (
        <div className="hf-error">
          {publishMutation.error instanceof Error
            ? publishMutation.error.message
            : 'Failed to publish homepage.'}
        </div>
      )}

      {/* ── Blocks ─────────────────────────────────────────── */}
      {viewMode === 'published' ? (
        <PublishedHomepagePreview blocks={homepage.publishedPageBlocks} />
      ) : (
        <>
          <HomepageDraftPublishSummary blocks={homepage.pageBlocks} />
          {homepage.pageBlocks.length === 0 ? (
            <div className="hf-state-screen">
              <h2>No blocks yet</h2>
              <p>
                This homepage has no content blocks. Add a content block to
                start curating.
              </p>
            </div>
          ) : (
            <HomepageBlocksSortableList
              blocks={homepage.pageBlocks}
              disabled={
                reorderBlocksMutation.isPending ||
                deleteBlockMutation.isPending ||
                addBlockMutation.isPending
              }
              onReorder={(orderedIds) =>
                reorderBlocksMutation.mutate(orderedIds)
              }
            >
              {(block: PageBlockResponse, idx: number) => {
                const externalUsedKeys = (() => {
                  const combined = new Set<string>()
                  for (const [id, keys] of pageBlockSlotKeys) {
                    if (id !== block.id) for (const k of keys) combined.add(k)
                  }
                  return combined
                })()

                return (
                  <LocationHomepageBlockRenderer
                    key={locationHomepageBlockKey(
                      block,
                      locationGridChildLevel
                    )}
                    block={block}
                    blockIndex={idx}
                    homepageId={numericId}
                    canManage={canManage}
                    locationGridChildLevel={locationGridChildLevel}
                    convertTargets={convertEmptyFeaturedArticlesTargets}
                    externalUsedKeys={externalUsedKeys}
                    onSlotsChange={handleSlotsChange}
                    onDeleteBlock={(blockId) =>
                      deleteBlockMutation.mutate({ blockId })
                    }
                    isDeletePending={deleteBlockMutation.isPending}
                    deletingBlockId={deletingBlockId}
                    deleteError={deleteError}
                    onConvertBlock={handleConvertBlock}
                    invalidateHomepage={invalidateHomepage}
                  />
                )
              }}
            </HomepageBlocksSortableList>
          )}
        </>
      )}

      {/* ── Add block ──────────────────────────────────────── */}
      {viewMode === 'draft' && (
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
      )}
    </div>
  )
}
