import { Link } from 'react-router-dom'

import { useAuth, usePermissions } from '../auth'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import HomepageBlocksSortableList from './HomepageBlocksSortableList'
import HomepageDraftPublishSummary from './HomepageDraftPublishSummary'
import MainHomepageBlockRenderer from './MainHomepageBlockRenderer'
import PublishedHomepagePreview from './PublishedHomepagePreview'
import './homepageFeaturedContent.css'
import { homepageBlockEditorIdentity, type PageBlockResponse } from './pageBlocks'
import { useMainHomepageEditor } from './useMainHomepageEditor'

function usedKeysOutsideBlock(
  slotKeysByBlock: Map<string, Set<string>>,
  blockId: string,
) {
  const usedKeys = new Set<string>()
  for (const [candidateBlockId, keys] of slotKeysByBlock) {
    if (candidateBlockId !== blockId) {
      for (const key of keys) usedKeys.add(key)
    }
  }
  return usedKeys
}

export default function MainHomepagePage() {
  const { token } = useAuth()
  const { canManagePublished: canManage } = usePermissions()
  const {
    homepageQuery,
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
    invalidateHomepage,
  } = useMainHomepageEditor(token, canManage)

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

  return (
    <div className="hf-page">
      <div className="hf-detail-header">
        <div className="hf-detail-header-left">
          <Link to="/homepage-featured-content" className="hf-btn-ghost">
            ← Hub
          </Link>
          <div className="hf-detail-title-block">
            <h1>Main Homepage</h1>
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--muted)',
                fontFamily: 'monospace',
              }}
            >
              domain.com
            </span>
          </div>
          <span className="hf-level-tag">global</span>
        </div>
        <div className="hf-detail-header-center">
          <span className="hf-enabled-tag on">Always active</span>
        </div>
        <div className="hf-detail-header-actions">
          <div className="hf-view-mode-group" role="group" aria-label="View mode">
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
              disabled={!homepage.publishedPageBlocks?.length}
              title={
                homepage.publishedPageBlocks?.length
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
            title="Publish the full main homepage draft after validation."
          >
            {publishMutation.isPending ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {homepage.lastPublishedAt && (
        <div className="hf-detail-meta">
          Published revision {homepage.publishedRevision ?? 0} ·{' '}
          {new Date(homepage.lastPublishedAt).toLocaleString()}
        </div>
      )}
      {publishMutation.isError && (
        <div className="hf-error">
          {publishMutation.error instanceof Error
            ? publishMutation.error.message
            : 'Failed to publish main homepage.'}
        </div>
      )}

      {viewMode === 'published' ? (
        <PublishedHomepagePreview blocks={homepage.publishedPageBlocks} />
      ) : (
        <>
          <HomepageDraftPublishSummary blocks={homepage.pageBlocks} />
          {homepage.pageBlocks.length === 0 ? (
            <div className="hf-state-screen">
              <h2>No blocks yet</h2>
              <p>
                The main homepage has no content blocks. Add a content block to
                start curating.
              </p>
            </div>
          ) : (
            <HomepageBlocksSortableList
              blocks={homepage.pageBlocks}
              disabled={
                reorderBlocksMutation.isPending
                || deleteBlockMutation.isPending
                || addBlockMutation.isPending
              }
              onReorder={(orderedIds) => reorderBlocksMutation.mutate(orderedIds)}
            >
              {(block: PageBlockResponse, blockIndex: number) => (
                <MainHomepageBlockRenderer
                  key={homepageBlockEditorIdentity(block).join(':')}
                  block={block}
                  blockIndex={blockIndex}
                  token={token}
                  canManage={canManage}
                  externalUsedKeys={usedKeysOutsideBlock(pageBlockSlotKeys, block.id)}
                  onSlotsChange={handleSlotsChange}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletePending={deleteBlockMutation.isPending}
                  deletingBlockId={deletingBlockId}
                  deleteError={deleteError}
                  onConvertBlock={handleConvertBlock}
                  invalidateHomepage={invalidateHomepage}
                />
              )}
            </HomepageBlocksSortableList>
          )}
        </>
      )}

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
            />
          )}
        </div>
      )}
    </div>
  )
}
