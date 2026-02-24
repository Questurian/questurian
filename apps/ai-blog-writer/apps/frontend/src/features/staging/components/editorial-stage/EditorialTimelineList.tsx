import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MediaAsset } from '../../api'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../../types'
import type { EditorialPublishValidation } from '../../features/editorial-stage-article/editorial-markdown.service'
import type { BlockImageModalMode, OpenBlockImageModalOptions, SupportedEditorialComponent } from '../../features/editorial-stage-article/types'
import type { TimelineItem } from '../../features/editorial-stage-article/workflow.service'
import { getMediaAssetAltText } from '../../features/editorial-stage-article/media-utils'
import { MarkdownBlockEditor } from '../../features/markdown-editor'
import { BlockActionZone } from './BlockActionZone'
import { renderEditorialBlockCard } from './renderEditorialBlockCard'

type EditorialTimelineListProps = {
  timeline: {
    stagedArticle: StagedArticle
    activeEditingTimelineItemId: string | null
    totalTechnicalBlockCount: number
    timelineItems: TimelineItem[]
    timelineIndexMap: Map<string, number>
    editorialBlockById: Map<string, EditorialBlock>
    contentBlockById: Map<string, ContentBlock>
    contentBlockIndexMap: Map<string, number>
    contentTimelineNumberMap: Map<string, number>
    editorialTimelineNumberMap: Map<string, number>
    imageTimelineNumberMap: Map<string, number>
    lastContentBlock: ContentBlock | null
  }
  drag: {
    draggedTimelineItemId: string | null
    dragOverTimelineItemId: string | null
    handleDragStart: (e: React.DragEvent, timelineItemId: string) => void
    handleDragEnd: () => void
    handleDragOver: (e: React.DragEvent, timelineItemId: string) => void
    handleDragLeave: () => void
    handleDrop: (e: React.DragEvent, targetTimelineItemId: string) => void
    moveTimelineItem: (timelineItemId: string, direction: 'up' | 'down') => void
  }
  editorial: {
    editorialPublishAnalysis: {
      byId: Record<string, EditorialPublishValidation>
    }
    fixEditorialBlock: (blockId: string) => void
    updateEditorialBlockMarkdown: (blockId: string, nextMarkdown: string) => void
    removeEditorialBlock: (blockId: string) => void
  }
  picker: {
    openImagePickerTarget: string | null
    openEditorialPickerTarget: string | null
    toggleImagePicker: (target: string) => void
    toggleEditorialPicker: (target: string) => void
    openBlockImageModal: (
      blockId: string,
      mode: BlockImageModalMode,
      options?: OpenBlockImageModalOptions
    ) => void
    addEditorialFromPicker: (
      component: SupportedEditorialComponent,
      afterBlockId?: string,
      placeAfterImage?: boolean
    ) => void
    addNewBlock: (afterBlockId?: string) => void
    mergeWithNextBlock: (blockId: string) => void
  }
  content: {
    toggleTimelineItemEdit: (timelineItemId: string) => void
    deleteBlock: (blockId: string) => void
    updateBlockContent: (blockId: string, newContent: string) => void
    rewriteTextBlockWithAi: (
      blockId: string,
      currentContent: string,
      prompt: string,
      includeWholeArticleContext: boolean
    ) => Promise<string>
    findHeaderSplitPoints: (content: string) => { lineIndex: number; headerText: string }[]
    splitBlockAtHeader: (blockId: string, lineIndex: number) => void
  }
  media: {
    mediaAssets: MediaAsset[]
    getImageUrl: (asset: MediaAsset) => string
    updateMediaGroupCaption: (blockId: string, caption: string) => void
    removeImgTrioAfterBlock: (blockId: string) => void
    removeImgPairAfterBlock: (blockId: string) => void
    removeImageAfterBlock: (blockId: string) => void
  }
}

export function EditorialTimelineList({
  timeline,
  drag,
  editorial,
  picker,
  content,
  media,
}: EditorialTimelineListProps) {
  const {
    stagedArticle,
    activeEditingTimelineItemId,
    totalTechnicalBlockCount,
    timelineItems,
    timelineIndexMap,
    editorialBlockById,
    contentBlockById,
    contentBlockIndexMap,
    contentTimelineNumberMap,
    editorialTimelineNumberMap,
    imageTimelineNumberMap,
    lastContentBlock,
  } = timeline
  const {
    draggedTimelineItemId,
    dragOverTimelineItemId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    moveTimelineItem,
  } = drag
  const {
    editorialPublishAnalysis,
    fixEditorialBlock,
    updateEditorialBlockMarkdown,
    removeEditorialBlock,
  } = editorial
  const {
    openImagePickerTarget,
    openEditorialPickerTarget,
    toggleImagePicker,
    toggleEditorialPicker,
    openBlockImageModal,
    addEditorialFromPicker,
    addNewBlock,
    mergeWithNextBlock,
  } = picker
  const {
    toggleTimelineItemEdit,
    deleteBlock,
    updateBlockContent,
    rewriteTextBlockWithAi,
    findHeaderSplitPoints,
    splitBlockAtHeader,
  } = content
  const {
    mediaAssets,
    getImageUrl,
    updateMediaGroupCaption,
    removeImgTrioAfterBlock,
    removeImgPairAfterBlock,
    removeImageAfterBlock,
  } = media

  return (
    <div className="stage-article-section">
      <div className="block-editor-header">
        <label className="stage-article-label">
          Content Blocks
          <span className="stage-article-label-hint">
            {activeEditingTimelineItemId
              ? 'Editing one block at a time'
              : 'Fuse blocks or add images between them'}
          </span>
        </label>
        <span className="stage-article-block-count" title="Includes content, editorial, and image blocks">
          {totalTechnicalBlockCount} blocks
        </span>
      </div>

      <div className="block-editor">
        {timelineItems.map((timelineItem) => {
          const timelineIndex = timelineIndexMap.get(timelineItem.id) ?? 0
          const canReorder = !stagedArticle.publishedToPayload && !activeEditingTimelineItemId
          const isFirstTimelineItem = timelineIndex === 0
          const isLastTimelineItem = timelineIndex === timelineItems.length - 1
          const hasNextTimelineItem = timelineIndex < timelineItems.length - 1
          const nextTimelineItem = hasNextTimelineItem
            ? timelineItems[timelineIndex + 1]
            : null
          const pickerKey = `after:${timelineItem.id}`

          if (timelineItem.type === 'editorial') {
            const editorialBlock = editorialBlockById.get(timelineItem.editorialBlockId)
            if (!editorialBlock) return null
            const isEditingThisEditorialBlock =
              activeEditingTimelineItemId === timelineItem.id
            const anchorBlock = editorialBlock.afterBlockId
              ? contentBlockById.get(editorialBlock.afterBlockId)
              : null

            return (
              <div
                key={timelineItem.id}
                data-timeline-id={timelineItem.id}
                className={`block-editor-item editorial-block-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, timelineItem.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, timelineItem.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, timelineItem.id)}
              >
                {renderEditorialBlockCard(
                  editorialBlock,
                  editorialTimelineNumberMap.get(editorialBlock.id) || timelineIndex + 1,
                  {
                    validation: editorialPublishAnalysis.byId[editorialBlock.id],
                    onFixBlock: () => fixEditorialBlock(editorialBlock.id),
                    disableFix: stagedArticle.publishedToPayload,
                    canEdit: isEditingThisEditorialBlock && !stagedArticle.publishedToPayload,
                    onToggleEdit: stagedArticle.publishedToPayload
                      ? undefined
                      : () => toggleTimelineItemEdit(timelineItem.id),
                    onChangeMarkdown: (nextMarkdown) =>
                      updateEditorialBlockMarkdown(editorialBlock.id, nextMarkdown),
                    onRemoveBlock: () => removeEditorialBlock(editorialBlock.id),
                    disableRemove: stagedArticle.publishedToPayload,
                    canReorder,
                    onMoveUp: () => moveTimelineItem(timelineItem.id, 'up'),
                    onMoveDown: () => moveTimelineItem(timelineItem.id, 'down'),
                    disableMoveUp: isFirstTimelineItem,
                    disableMoveDown: isLastTimelineItem,
                  }
                )}
                {!stagedArticle.publishedToPayload
                  && hasNextTimelineItem
                  && anchorBlock
                  && (
                    <BlockActionZone
                      block={anchorBlock}
                      publishedToPayload={stagedArticle.publishedToPayload}
                      showFuse={false}
                      pickerKey={pickerKey}
                      placeAfterImage={editorialBlock.placeAfterImage === true}
                      openImagePickerTarget={openImagePickerTarget}
                      openEditorialPickerTarget={openEditorialPickerTarget}
                      toggleImagePicker={toggleImagePicker}
                      toggleEditorialPicker={toggleEditorialPicker}
                      openBlockImageModal={openBlockImageModal}
                      addEditorialFromPicker={addEditorialFromPicker}
                      addNewBlock={addNewBlock}
                      mergeWithNextBlock={mergeWithNextBlock}
                    />
                  )}
              </div>
            )
          }

          if (timelineItem.type === 'image') {
            const block = contentBlockById.get(timelineItem.contentBlockId)
            if (!block) return null
            if (!block.imageAfter && !block.imgPairAfter && !block.imgTrioAfter) return null
            const imageBlockNumber = imageTimelineNumberMap.get(block.id) || timelineIndex + 1
            const isEditingThisImageBlock = activeEditingTimelineItemId === timelineItem.id

            return (
              <div
                key={timelineItem.id}
                data-timeline-id={timelineItem.id}
                className={`block-editor-item block-image-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, timelineItem.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, timelineItem.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, timelineItem.id)}
              >
                <div className="block-image-container">
                  <div className="block-card block-image-card">
                    <div className="block-card-header">
                      <div className="block-card-header-left">
                        {canReorder && (
                          <div className="block-drag-handle" title="Drag to reorder">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="9" cy="5" r="1.5"/>
                              <circle cx="15" cy="5" r="1.5"/>
                              <circle cx="9" cy="12" r="1.5"/>
                              <circle cx="15" cy="12" r="1.5"/>
                              <circle cx="9" cy="19" r="1.5"/>
                              <circle cx="15" cy="19" r="1.5"/>
                            </svg>
                          </div>
                        )}
                        <span className="block-number">{imageBlockNumber}</span>
                        <span className="block-type-badge block-type-badge-image">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          {block.imgTrioAfter
                            ? `Img Trio (3) | ${block.imgTrioAfter.format === 'square' ? '1:1' : '16:9'}`
                            : block.imgPairAfter
                              ? 'Img Pair (2) | 4:5'
                              : 'Image | 16:9'}
                        </span>
                      </div>
                      <div className="block-card-header-right">
                        {canReorder && (
                          <div className="block-move-buttons">
                            <button
                              type="button"
                              className="block-move-btn"
                              onClick={() => moveTimelineItem(timelineItem.id, 'up')}
                              disabled={isFirstTimelineItem}
                              title="Move up"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 15l-6-6-6 6"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="block-move-btn"
                              onClick={() => moveTimelineItem(timelineItem.id, 'down')}
                              disabled={isLastTimelineItem}
                              title="Move down"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6"/>
                              </svg>
                            </button>
                          </div>
                        )}
                        {!stagedArticle.publishedToPayload && (
                          <button
                            type="button"
                            className="block-edit-btn"
                            onClick={() => toggleTimelineItemEdit(timelineItem.id)}
                            title={isEditingThisImageBlock ? 'Done editing caption' : 'Edit caption'}
                          >
                            {isEditingThisImageBlock ? 'Done' : 'Caption'}
                          </button>
                        )}
                        {!stagedArticle.publishedToPayload && (block.imageAfter || block.imgPairAfter || block.imgTrioAfter) && (
                          <button
                            type="button"
                            className="block-edit-btn"
                            onClick={() => {
                              if (block.imgTrioAfter) {
                                openBlockImageModal(block.id, 'img-trio', {
                                  caption: block.imgTrioAfter.caption || '',
                                  trioFormat: block.imgTrioAfter.format,
                                  selectedAssetIds: [
                                    block.imgTrioAfter.imageOne,
                                    block.imgTrioAfter.imageTwo,
                                    block.imgTrioAfter.imageThree,
                                  ],
                                  replaceExistingBlock: true,
                                })
                                return
                              }
                              if (block.imgPairAfter) {
                                openBlockImageModal(block.id, 'img', {
                                  caption: block.imgPairAfter.caption || '',
                                  selectedAssetIds: [
                                    block.imgPairAfter.imageOne,
                                    block.imgPairAfter.imageTwo,
                                  ],
                                  replaceExistingBlock: true,
                                })
                                return
                              }
                              if (block.imageAfter) {
                                openBlockImageModal(block.id, 'default', {
                                  replaceExistingBlock: true,
                                })
                              }
                            }}
                            title={
                              block.imgTrioAfter
                                ? 'Edit img trio'
                                : block.imgPairAfter
                                  ? 'Edit img pair'
                                  : 'Change image'
                            }
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
                            </svg>
                            Edit
                          </button>
                        )}
                        {!stagedArticle.publishedToPayload && (
                          <button
                            type="button"
                            className="block-delete-btn"
                            onClick={() => {
                              if (block.imgTrioAfter) {
                                removeImgTrioAfterBlock(block.id)
                                return
                              }
                              if (block.imgPairAfter) {
                                removeImgPairAfterBlock(block.id)
                                return
                              }
                              removeImageAfterBlock(block.id)
                            }}
                            title={block.imgPairAfter || block.imgTrioAfter ? 'Remove img block' : 'Remove image'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="block-image">
                      {(() => {
                        if (block.imgTrioAfter) {
                          const imageOne = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageOne)
                          const imageTwo = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageTwo)
                          const imageThree = mediaAssets.find((m) => m.id === block.imgTrioAfter?.imageThree)

                          if (!imageOne || !imageTwo || !imageThree) {
                            return <span className="block-image-missing">One or more images not found</span>
                          }

                          return (
                            <div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                <img
                                  src={getImageUrl(imageOne)}
                                  alt={getMediaAssetAltText(imageOne) || ''}
                                />
                                <img
                                  src={getImageUrl(imageTwo)}
                                  alt={getMediaAssetAltText(imageTwo) || ''}
                                />
                                <img
                                  src={getImageUrl(imageThree)}
                                  alt={getMediaAssetAltText(imageThree) || ''}
                                />
                              </div>
                              {isEditingThisImageBlock && !stagedArticle.publishedToPayload ? (
                                <input
                                  type="text"
                                  className="stage-article-modal-search-input"
                                  style={{ marginTop: '0.5rem' }}
                                  value={block.imgTrioAfter.caption || ''}
                                  onChange={(event) => updateMediaGroupCaption(block.id, event.target.value)}
                                  placeholder="Caption for all images..."
                                />
                              ) : block.imgTrioAfter.caption?.trim() ? (
                                <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.85rem', opacity: 0.8 }}>
                                  {block.imgTrioAfter.caption}
                                </p>
                              ) : null}
                            </div>
                          )
                        }

                        if (block.imgPairAfter) {
                          const imageOne = mediaAssets.find((m) => m.id === block.imgPairAfter?.imageOne)
                          const imageTwo = mediaAssets.find((m) => m.id === block.imgPairAfter?.imageTwo)

                          if (!imageOne || !imageTwo) {
                            return <span className="block-image-missing">One or more images not found</span>
                          }

                          return (
                            <div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <img
                                  src={getImageUrl(imageOne)}
                                  alt={getMediaAssetAltText(imageOne) || ''}
                                />
                                <img
                                  src={getImageUrl(imageTwo)}
                                  alt={getMediaAssetAltText(imageTwo) || ''}
                                />
                              </div>
                              {isEditingThisImageBlock && !stagedArticle.publishedToPayload ? (
                                <input
                                  type="text"
                                  className="stage-article-modal-search-input"
                                  style={{ marginTop: '0.5rem' }}
                                  value={block.imgPairAfter.caption || ''}
                                  onChange={(event) => updateMediaGroupCaption(block.id, event.target.value)}
                                  placeholder="Caption for both images..."
                                />
                              ) : block.imgPairAfter.caption?.trim() ? (
                                <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.85rem', opacity: 0.8 }}>
                                  {block.imgPairAfter.caption}
                                </p>
                              ) : null}
                            </div>
                          )
                        }

                        const img = mediaAssets.find((m) => m.id === block.imageAfter)
                        if (!img) {
                          return <span className="block-image-missing">Image not found</span>
                        }

                        return (
                          <img src={getImageUrl(img)} alt={getMediaAssetAltText(img) || block.imageAfterAltText || ''} />
                        )
                      })()}
                    </div>
                  </div>
                </div>
                {!stagedArticle.publishedToPayload
                  && hasNextTimelineItem
                  && (
                    <BlockActionZone
                      block={block}
                      publishedToPayload={stagedArticle.publishedToPayload}
                      showFuse={false}
                      pickerKey={pickerKey}
                      placeAfterImage={false}
                      allowImageAdd
                      openImagePickerTarget={openImagePickerTarget}
                      openEditorialPickerTarget={openEditorialPickerTarget}
                      toggleImagePicker={toggleImagePicker}
                      toggleEditorialPicker={toggleEditorialPicker}
                      openBlockImageModal={openBlockImageModal}
                      addEditorialFromPicker={addEditorialFromPicker}
                      addNewBlock={addNewBlock}
                      mergeWithNextBlock={mergeWithNextBlock}
                    />
                  )}
              </div>
            )
          }

          const block = contentBlockById.get(timelineItem.contentBlockId)
          if (!block) return null
          const contentIndex = contentBlockIndexMap.get(block.id) ?? 0
          const contentBlockNumber = contentTimelineNumberMap.get(block.id) ?? (contentIndex + 1)
          const isEditingThisContentBlock =
            activeEditingTimelineItemId === timelineItem.id
            && !stagedArticle.publishedToPayload

          return (
            <div
              key={timelineItem.id}
              data-timeline-id={timelineItem.id}
              className={`block-editor-item ${draggedTimelineItemId === timelineItem.id ? 'dragging' : ''} ${dragOverTimelineItemId === timelineItem.id ? 'drag-over' : ''}`}
              draggable={canReorder}
              onDragStart={(e) => handleDragStart(e, timelineItem.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, timelineItem.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, timelineItem.id)}
            >
              <div className={`block-card ${isEditingThisContentBlock ? 'editing' : ''} ${block.type === 'pullquote' ? 'pullquote' : ''}`}>
                <div className="block-card-header">
                  <div className="block-card-header-left">
                    {canReorder && (
                      <div className="block-drag-handle" title="Drag to reorder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="9" cy="5" r="1.5"/>
                          <circle cx="15" cy="5" r="1.5"/>
                          <circle cx="9" cy="12" r="1.5"/>
                          <circle cx="15" cy="12" r="1.5"/>
                          <circle cx="9" cy="19" r="1.5"/>
                          <circle cx="15" cy="19" r="1.5"/>
                        </svg>
                      </div>
                    )}
                    <span className="block-number">{contentBlockNumber}</span>
                    {block.type === 'pullquote' && (
                      <span className="block-type-badge">Pull Quote</span>
                    )}
                  </div>
                  <div className="block-card-header-right">
                    {canReorder && (
                      <div className="block-move-buttons">
                        <button
                          type="button"
                          className="block-move-btn"
                          onClick={() => moveTimelineItem(timelineItem.id, 'up')}
                          disabled={isFirstTimelineItem}
                          title="Move up"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 15l-6-6-6 6"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="block-move-btn"
                          onClick={() => moveTimelineItem(timelineItem.id, 'down')}
                          disabled={isLastTimelineItem}
                          title="Move down"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </button>
                      </div>
                    )}
                    {!stagedArticle.publishedToPayload && (
                      <button
                        type="button"
                        className="block-edit-btn"
                        onClick={() => toggleTimelineItemEdit(timelineItem.id)}
                        title={isEditingThisContentBlock ? 'Done editing block' : 'Edit block'}
                      >
                        {isEditingThisContentBlock ? 'Done' : 'Edit'}
                      </button>
                    )}
                    {!stagedArticle.publishedToPayload && (
                      <button
                        type="button"
                        className="block-delete-btn"
                        onClick={() => deleteBlock(block.id)}
                        title="Delete block"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {isEditingThisContentBlock ? (
                  <MarkdownBlockEditor
                    blockId={block.id}
                    value={block.content}
                    onChange={(nextValue) => updateBlockContent(block.id, nextValue)}
                    showToolbar={block.type === 'text'}
                    enforceHeadingStructure={block.type === 'text'}
                    onAiRewrite={block.type === 'text'
                      ? async ({
                        currentContent,
                        prompt,
                        includeWholeArticleContext,
                      }) =>
                        rewriteTextBlockWithAi(
                          block.id,
                          currentContent,
                          prompt,
                          includeWholeArticleContext
                        )
                      : undefined}
                    className={block.type === 'pullquote' ? 'block-textarea pullquote' : undefined}
                    rows={block.type === 'pullquote' ? 3 : Math.max(4, block.content.split('\n').length + 2)}
                    placeholder={block.type === 'pullquote' ? 'Enter your pull quote...' : ''}
                  />
                ) : block.type === 'pullquote' ? (
                  <div className="block-pullquote-preview">
                    <svg className="block-pullquote-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                    </svg>
                    <p>{block.content}</p>
                  </div>
                ) : (
                  <div className="block-preview">
                    {(() => {
                      const splitPoints = findHeaderSplitPoints(block.content)
                      if (splitPoints.length === 0 || stagedArticle.publishedToPayload) {
                        return (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {block.content}
                          </ReactMarkdown>
                        )
                      }

                      const lines = block.content.split('\n')
                      const segments: { content: string; splitLineIndex: number | null }[] = []
                      let lastIndex = 0

                      for (const point of splitPoints) {
                        segments.push({
                          content: lines.slice(lastIndex, point.lineIndex).join('\n'),
                          splitLineIndex: point.lineIndex,
                        })
                        lastIndex = point.lineIndex
                      }
                      segments.push({
                        content: lines.slice(lastIndex).join('\n'),
                        splitLineIndex: null,
                      })

                      return segments.map((segment, index) => (
                        <div key={index}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {segment.content}
                          </ReactMarkdown>
                          {segment.splitLineIndex !== null && (
                            <div className="block-split-zone">
                              <button
                                type="button"
                                className="block-split-btn"
                                onClick={() => splitBlockAtHeader(block.id, segment.splitLineIndex!)}
                                title="Split here"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/>
                                </svg>
                                Split
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
              {!stagedArticle.publishedToPayload
                && hasNextTimelineItem
                && (
                  <BlockActionZone
                    block={block}
                    publishedToPayload={stagedArticle.publishedToPayload}
                    showFuse={nextTimelineItem?.type === 'content'}
                    pickerKey={pickerKey}
                    placeAfterImage={false}
                    openImagePickerTarget={openImagePickerTarget}
                    openEditorialPickerTarget={openEditorialPickerTarget}
                    toggleImagePicker={toggleImagePicker}
                    toggleEditorialPicker={toggleEditorialPicker}
                    openBlockImageModal={openBlockImageModal}
                    addEditorialFromPicker={addEditorialFromPicker}
                    addNewBlock={addNewBlock}
                    mergeWithNextBlock={mergeWithNextBlock}
                  />
                )}
            </div>
          )
        })}

        {!stagedArticle.publishedToPayload && lastContentBlock && (
          <BlockActionZone
            block={lastContentBlock}
            publishedToPayload={stagedArticle.publishedToPayload}
            showFuse={false}
            pickerKey="end"
            placeAfterImage={false}
            openImagePickerTarget={openImagePickerTarget}
            openEditorialPickerTarget={openEditorialPickerTarget}
            toggleImagePicker={toggleImagePicker}
            toggleEditorialPicker={toggleEditorialPicker}
            openBlockImageModal={openBlockImageModal}
            addEditorialFromPicker={addEditorialFromPicker}
            addNewBlock={addNewBlock}
            mergeWithNextBlock={mergeWithNextBlock}
          />
        )}
      </div>
    </div>
  )
}
