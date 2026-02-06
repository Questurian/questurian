import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../../../providers/AuthProvider'
import { ImageUpload, type UploadImageResponse } from '../../../features/images'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  markArticleSynced,
  type Location,
  type MediaAsset,
} from '../api'
import '../styles/stage-article.css'

// Block type for parsed markdown sections
export type ContentBlock = {
  id: string
  content: string // Markdown content (header + body)
  imageAfter?: number // Media asset ID for image between this and next block
}

// Staged Article Type
export type StagedArticle = {
  id: string
  runId: string
  originalTitle: string
  originalContent: string
  originalType: string
  // Editable fields
  title: string
  content: string
  blocks: ContentBlock[]
  // Payload fields
  locationId?: number
  featuredImageId?: number
  // Status
  lexicalConverted: boolean
  lexicalData?: object
  publishedToPayload: boolean
  payloadArticleId?: number
  createdAt: string
  updatedAt: string
}

// Parse markdown into blocks at each header
function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.split('\n')
  const blocks: ContentBlock[] = []
  let currentBlock: string[] = []
  let blockIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isHeader = /^#{1,6}\s/.test(line)

    if (isHeader && currentBlock.length > 0) {
      // Save previous block
      blocks.push({
        id: `block_${blockIndex++}`,
        content: currentBlock.join('\n').trim(),
      })
      currentBlock = [line]
    } else {
      currentBlock.push(line)
    }
  }

  // Don't forget the last block
  if (currentBlock.length > 0) {
    const content = currentBlock.join('\n').trim()
    if (content) {
      blocks.push({
        id: `block_${blockIndex}`,
        content,
      })
    }
  }

  return blocks
}

// Reconstruct markdown from blocks
function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks.map(b => b.content).join('\n\n')
}

export default function StageArticlePage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // URL params (for new staging)
  const urlRunId = searchParams.get('runId') || ''
  const urlTitle = searchParams.get('title') || ''
  const urlContent = searchParams.get('content') || ''
  const urlType = searchParams.get('type') || ''
  const stagedId = searchParams.get('stagedId') || ''

  // Reference data
  const [locations, setLocations] = useState<Location[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Staged article state
  const [stagedArticle, setStagedArticle] = useState<StagedArticle | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Form state
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)

  // Modal state for featured image
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSearch, setImageSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [imageAltText, setImageAltText] = useState('')

  // Modal state for block images
  const [blockImageModal, setBlockImageModal] = useState<{ blockId: string; show: boolean } | null>(null)
  const [blockImageSearch, setBlockImageSearch] = useState('')
  const [showBlockUploadModal, setShowBlockUploadModal] = useState(false)
  const [blockImageAltText, setBlockImageAltText] = useState('')

  // Conversion state
  const [isConverting, setIsConverting] = useState(false)

  // Storage key
  const STORAGE_KEY = 'youtube2blog_staged_articles'

  // Load or create staged article
  useEffect(() => {
    if (!urlRunId && !stagedId) return

    const loadStagedArticle = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []

      if (stagedId) {
        // Load existing staged article
        const existing = allStaged.find(s => s.id === stagedId)
        if (existing) {
          // Migrate old articles without blocks
          if (!existing.blocks || existing.blocks.length === 0) {
            existing.blocks = parseMarkdownToBlocks(existing.content)
          }
          setStagedArticle(existing)
        } else {
          setError('Staged article not found')
        }
      } else if (urlRunId) {
        // Check if already staged
        const existing = allStaged.find(s => s.runId === urlRunId)
        if (existing) {
          if (!existing.blocks || existing.blocks.length === 0) {
            existing.blocks = parseMarkdownToBlocks(existing.content)
          }
          setStagedArticle(existing)
          navigate(`/youtube2blog/stage-article?stagedId=${existing.id}`, { replace: true })
        } else {
          // Create new staged article
          const blocks = parseMarkdownToBlocks(urlContent)
          const newStaged: StagedArticle = {
            id: `staged_${Date.now()}`,
            runId: urlRunId,
            originalTitle: urlTitle,
            originalContent: urlContent,
            originalType: urlType,
            title: urlTitle,
            content: urlContent,
            blocks,
            lexicalConverted: false,
            publishedToPayload: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          // Save to storage
          const updated = [...allStaged, newStaged]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

          setStagedArticle(newStaged)
          navigate(`/youtube2blog/stage-article?stagedId=${newStaged.id}`, { replace: true })
        }
      }
    }

    loadStagedArticle()
  }, [urlRunId, stagedId, urlTitle, urlContent, urlType, navigate])

  // Load reference data
  useEffect(() => {
    if (!token) return

    const loadData = async () => {
      try {
        const [locationsRes, mediaRes] = await Promise.all([
          fetchLocations(token, { limit: 200 }),
          fetchMediaAssets(token, { limit: 50, mimeType: 'image/' }),
        ])

        setLocations(locationsRes.docs || [])
        setMediaAssets(mediaRes.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [token])

  const updateStagedArticle = useCallback((updates: Partial<StagedArticle>) => {
    setStagedArticle(prev => {
      if (!prev) return null
      const updated = { ...prev, ...updates, updatedAt: new Date().toISOString() }

      // Update content from blocks if blocks were updated
      if (updates.blocks) {
        updated.content = blocksToMarkdown(updates.blocks)
      }

      // Update in localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
      const index = allStaged.findIndex(s => s.id === updated.id)
      if (index >= 0) {
        allStaged[index] = updated
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
      }

      return updated
    })
  }, [])

  // Block operations
  const updateBlockContent = useCallback((blockId: string, newContent: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, content: newContent } : b
    )
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const addImageAfterBlock = useCallback((blockId: string, imageId: number) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, imageAfter: imageId } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const removeImageAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, imageAfter: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const mergeWithNextBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1 || blockIndex >= stagedArticle.blocks.length - 1) return

    const currentBlock = stagedArticle.blocks[blockIndex]
    const nextBlock = stagedArticle.blocks[blockIndex + 1]

    // Merge content, removing any image that was between them
    const mergedBlock: ContentBlock = {
      id: currentBlock.id,
      content: `${currentBlock.content}\n\n${nextBlock.content}`,
      imageAfter: nextBlock.imageAfter, // Keep only the image after the second block
    }

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      mergedBlock,
      ...stagedArticle.blocks.slice(blockIndex + 2),
    ]

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const resetToOriginalBlocks = useCallback(() => {
    if (!stagedArticle) return
    if (!confirm('Reset all blocks to the original content? This will remove any edits and images between blocks.')) return

    const blocks = parseMarkdownToBlocks(stagedArticle.originalContent)
    updateStagedArticle({
      blocks,
      content: stagedArticle.originalContent,
      lexicalConverted: false
    })
  }, [stagedArticle, updateStagedArticle])

  // Find header positions within a block's content for split points
  const findHeaderSplitPoints = useCallback((content: string): { lineIndex: number; headerText: string }[] => {
    const lines = content.split('\n')
    const splitPoints: { lineIndex: number; headerText: string }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^#{1,6}\s/.test(line) && i > 0) {
        // Found a header that's not at the start - this is a split point
        splitPoints.push({ lineIndex: i, headerText: line.replace(/^#+\s*/, '') })
      }
    }

    return splitPoints
  }, [])

  const splitBlockAtHeader = useCallback((blockId: string, lineIndex: number) => {
    if (!stagedArticle) return

    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1) return

    const block = stagedArticle.blocks[blockIndex]
    const lines = block.content.split('\n')

    // Split content at the header line
    const beforeContent = lines.slice(0, lineIndex).join('\n').trim()
    const afterContent = lines.slice(lineIndex).join('\n').trim()

    if (!beforeContent || !afterContent) return

    const newBlocks: ContentBlock[] = [
      { id: block.id, content: beforeContent },
      { id: `block_${Date.now()}`, content: afterContent, imageAfter: block.imageAfter },
    ]

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      ...newBlocks,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const handleSaveEdits = () => {
    setIsEditing(false)
  }

  const handlePublish = async () => {
    if (!token || !stagedArticle) return

    const location = locations.find(l => l.id === stagedArticle.locationId)
    const featuredImage = mediaAssets.find(m => m.id === stagedArticle.featuredImageId)

    if (!location || !featuredImage) {
      setPublishResult({
        success: false,
        message: !location ? 'Please select a location' : 'Please select a featured image'
      })
      return
    }

    setIsPublishing(true)
    setPublishResult(null)
    setIsConverting(true)

    try {
      // Build content blocks array for Payload
      const contentBlocks: Array<{
        blockType: 'text' | 'image'
        content?: object
        image?: number
        altText?: string
      }> = []

      // Convert each block to Lexical and interleave with images
      for (const block of stagedArticle.blocks) {
        // Convert block markdown to Lexical
        const lexicalResult = await convertMarkdownToLexical(block.content)
        if (lexicalResult.success && lexicalResult.data) {
          contentBlocks.push({
            blockType: 'text',
            content: lexicalResult.data,
          })
        }

        // Add image block if one exists after this block
        if (block.imageAfter) {
          const imageAsset = mediaAssets.find(m => m.id === block.imageAfter)
          contentBlocks.push({
            blockType: 'image',
            image: block.imageAfter,
            altText: imageAsset?.alt || '',
          })
        }
      }

      setIsConverting(false)

      const result = await createArticle({
        title: stagedArticle.title || 'Untitled Article',
        locationRef: location.id,
        step1_complete: true,
        status: 'draft',
        headerSection: {
          featuredImage: featuredImage.id,
        },
        contentBlocks,
      }, token)

      // Mark as synced in the backend database
      await markArticleSynced(stagedArticle.runId, result.id)

      // Update staged article with publish status
      updateStagedArticle({
        publishedToPayload: true,
        payloadArticleId: result.id,
        lexicalConverted: true,
      })

      setPublishResult({
        success: true,
        message: `Published! Article ID: ${result.id}`
      })
    } catch (err) {
      setPublishResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to publish'
      })
    } finally {
      setIsPublishing(false)
      setIsConverting(false)
    }
  }

  const handleDelete = () => {
    if (!stagedArticle) return
    if (!confirm('Delete this staged article?')) return

    const stored = localStorage.getItem(STORAGE_KEY)
    const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []
    const updated = allStaged.filter(s => s.id !== stagedArticle.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    navigate('/youtube2blog/stage')
  }

  const handleUploadComplete = (result: UploadImageResponse) => {
    const heroAssetId = result.variantAssetIds?.hero
    if (heroAssetId) {
      updateStagedArticle({ featuredImageId: Number(heroAssetId) })
    }

    if (token) {
      fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
        .then(res => setMediaAssets(res.docs || []))
    }

    setShowUploadModal(false)
    setShowImageModal(false)
    setImageAltText('')
  }

  const handleBlockImageUploadComplete = (result: UploadImageResponse) => {
    if (!blockImageModal) return

    const heroAssetId = result.variantAssetIds?.hero
    if (heroAssetId) {
      addImageAfterBlock(blockImageModal.blockId, Number(heroAssetId))
    }

    if (token) {
      fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
        .then(res => setMediaAssets(res.docs || []))
    }

    setShowBlockUploadModal(false)
    setBlockImageModal(null)
    setBlockImageAltText('')
  }

  const getLocationDisplayName = (loc?: Location) => {
    if (!loc) return ''
    return loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
  }

  const getImageUrl = (img: MediaAsset) => {
    return img.url || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${img.filename}`
  }

  if (isLoading || !stagedArticle) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-loading">
          <div className="stage-article-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stage-article-page">
        <div className="stage-article-error">
          <h2>Error</h2>
          <p>{error}</p>
          <Link to="/youtube2blog/articles" className="stage-article-btn">Back to Articles</Link>
        </div>
      </div>
    )
  }

  const selectedLocation = locations.find(l => l.id === stagedArticle.locationId)
  const selectedFeaturedImage = mediaAssets.find(m => m.id === stagedArticle.featuredImageId)
  const allFieldsFilled = selectedLocation && selectedFeaturedImage

  return (
    <div className="stage-article-page">
      {/* Header */}
      <header className="stage-article-header">
        <div className="stage-article-header-top">
          <p className="stage-article-eyebrow">
            {stagedArticle.publishedToPayload ? 'Published to Payload' : 'Staging for Payload'}
          </p>

          <div className="stage-article-actions-bar">
            {!stagedArticle.publishedToPayload && (
              <button
                className="stage-article-icon-btn"
                onClick={() => isEditing ? handleSaveEdits() : setIsEditing(true)}
                title={isEditing ? 'Save changes' : 'Edit blocks'}
              >
                {isEditing ? 'Done Editing' : 'Edit Blocks'}
              </button>
            )}
            <button
              className="stage-article-icon-btn danger"
              onClick={handleDelete}
              title="Delete staged article"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Editable Title */}
        {isEditing ? (
          <input
            type="text"
            className="stage-article-title-input"
            value={stagedArticle.title}
            onChange={(e) => updateStagedArticle({ title: e.target.value })}
            placeholder="Article title..."
          />
        ) : (
          <h1>{stagedArticle.title || 'Untitled Article'}</h1>
        )}

        <div className="stage-article-header-meta">
          {stagedArticle.originalType && (
            <span className="stage-article-type-badge">{stagedArticle.originalType}</span>
          )}

          <span className="stage-article-block-count">
            {stagedArticle.blocks.length} blocks
          </span>

          {/* Status Badges */}
          <div className="stage-article-status-badges">
            {isConverting && (
              <span className="stage-article-badge converting">
                <span className="stage-article-badge-spinner" />
                Converting...
              </span>
            )}
            {stagedArticle.publishedToPayload && (
              <span className="stage-article-badge published">Published #{stagedArticle.payloadArticleId}</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Form */}
      <div className="stage-article-form">
        {/* Featured Image */}
        <div className="stage-article-section">
          <label className="stage-article-label">
            Featured Image <span className="required">*</span>
          </label>

          {selectedFeaturedImage ? (
            <div className="stage-article-featured-image">
              <img
                src={getImageUrl(selectedFeaturedImage)}
                alt={selectedFeaturedImage.alt || selectedFeaturedImage.filename}
              />
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  onClick={() => setShowImageModal(true)}
                  className="stage-article-change-btn"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowImageModal(true)}
              className="stage-article-image-placeholder"
              disabled={stagedArticle.publishedToPayload}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span>Click to select featured image</span>
            </button>
          )}
        </div>

        {/* Location */}
        <div className="stage-article-section">
          <label className="stage-article-label">
            Location <span className="required">*</span>
          </label>
          <select
            value={stagedArticle.locationId || ''}
            onChange={(e) => updateStagedArticle({ locationId: Number(e.target.value) || undefined })}
            className="stage-article-select"
            disabled={stagedArticle.publishedToPayload}
          >
            <option value="">-- Select a location --</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {getLocationDisplayName(loc)} ({loc.level})
              </option>
            ))}
          </select>
          {selectedLocation && (
            <div className="stage-article-selected-info">
              {getLocationDisplayName(selectedLocation)}
            </div>
          )}
        </div>

        {/* Block Editor */}
        <div className="stage-article-section">
          <div className="block-editor-header">
            <label className="stage-article-label">
              Content Blocks
              <span className="stage-article-label-hint">
                {isEditing ? 'Edit blocks or merge adjacent sections' : 'Fuse blocks or add images between them'}
              </span>
            </label>
            {!stagedArticle.publishedToPayload && (
              <button
                type="button"
                className="block-reset-btn"
                onClick={resetToOriginalBlocks}
                title="Reset to original blocks"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                Reset
              </button>
            )}
          </div>

          <div className="block-editor">
            {stagedArticle.blocks.map((block, index) => (
              <div key={block.id} className="block-editor-item">
                {/* Block Content */}
                <div className={`block-card ${isEditing ? 'editing' : ''}`}>
                  <div className="block-card-header">
                    <span className="block-number">{index + 1}</span>
                  </div>

                  {isEditing ? (
                    <textarea
                      className="block-textarea"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      rows={Math.max(4, block.content.split('\n').length + 2)}
                    />
                  ) : (
                    <div className="block-preview">
                      {(() => {
                        const splitPoints = findHeaderSplitPoints(block.content)
                        if (splitPoints.length === 0 || stagedArticle.publishedToPayload) {
                          // No split points, render normally
                          return (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {block.content}
                            </ReactMarkdown>
                          )
                        }

                        // Split content into segments at header boundaries
                        const lines = block.content.split('\n')
                        const segments: { content: string; splitLineIndex: number | null }[] = []
                        let lastIndex = 0

                        for (const point of splitPoints) {
                          segments.push({
                            content: lines.slice(lastIndex, point.lineIndex).join('\n'),
                            splitLineIndex: point.lineIndex, // The line index where we'd split AFTER this segment
                          })
                          lastIndex = point.lineIndex
                        }
                        // Add the last segment (no split after it)
                        segments.push({
                          content: lines.slice(lastIndex).join('\n'),
                          splitLineIndex: null,
                        })

                        return segments.map((segment, i) => (
                          <div key={i}>
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

                {/* Image After Block */}
                {block.imageAfter && (
                  <div className="block-image-container">
                    <div className="block-image">
                      {(() => {
                        const img = mediaAssets.find(m => m.id === block.imageAfter)
                        return img ? (
                          <>
                            <img src={getImageUrl(img)} alt={img.alt || ''} />
                            {!stagedArticle.publishedToPayload && (
                              <button
                                type="button"
                                className="block-image-remove"
                                onClick={() => removeImageAfterBlock(block.id)}
                                title="Remove image"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18"/>
                                  <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="block-image-missing">Image not found</span>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Action Zone Between Blocks (fuse + add image) */}
                {index < stagedArticle.blocks.length - 1 && !stagedArticle.publishedToPayload && (
                  <div className="block-action-zone">
                    <div className="block-action-line" />
                    <div className="block-action-buttons">
                      {/* Fuse Button */}
                      <button
                        type="button"
                        className="block-fuse-btn"
                        onClick={() => mergeWithNextBlock(block.id)}
                        title="Fuse with next block"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M7 10l5 5 5-5"/>
                          <path d="M7 14l5-5 5 5"/>
                        </svg>
                        Fuse
                      </button>

                      {/* Add Image Button (only if no image already) */}
                      {!block.imageAfter && (
                        <button
                          type="button"
                          className="block-add-image-btn"
                          onClick={() => setBlockImageModal({ blockId: block.id, show: true })}
                          title="Add image between blocks"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          Image
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="stage-article-info-box">
          <p><strong>Run ID:</strong> {stagedArticle.runId}</p>
          <p><strong>Created:</strong> {new Date(stagedArticle.createdAt).toLocaleString()}</p>
          <p><strong>Last Updated:</strong> {new Date(stagedArticle.updatedAt).toLocaleString()}</p>
        </div>

        {/* Actions */}
        {!stagedArticle.publishedToPayload ? (
          <div className="stage-article-actions">
            <button
              onClick={handlePublish}
              disabled={isPublishing || !allFieldsFilled}
              className="stage-article-publish-btn"
            >
              {isPublishing ? 'Publishing...' :
               !allFieldsFilled ? 'Select location and image' :
               'Publish to Payload CMS'}
            </button>
            <Link to="/youtube2blog/stage" className="stage-article-cancel">
              Back to Stage List
            </Link>
          </div>
        ) : (
          <div className="stage-article-actions">
            <div className="stage-article-published-notice">
              Published to Payload CMS
              {stagedArticle.payloadArticleId && (
                <span> - Article ID: {stagedArticle.payloadArticleId}</span>
              )}
            </div>
            <Link to="/youtube2blog/stage" className="stage-article-cancel">
              Back to Stage List
            </Link>
          </div>
        )}

        {/* Result */}
        {publishResult && (
          <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
            {publishResult.success ? '' : ''} {publishResult.message}
          </div>
        )}
      </div>

      {/* Featured Image Selection Modal */}
      {showImageModal && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>{showUploadModal ? 'Upload New Image' : 'Select Featured Image'}</h3>
              <button
                type="button"
                className="stage-article-modal-close"
                onClick={() => {
                  if (showUploadModal) {
                    setShowUploadModal(false)
                  } else {
                    setShowImageModal(false)
                  }
                }}
              >
                ×
              </button>
            </div>

            {!showUploadModal ? (
              <>
                <div className="stage-article-modal-actions">
                  <button
                    type="button"
                    className="stage-article-modal-upload-btn"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload New Image
                  </button>
                </div>

                <div className="stage-article-modal-search">
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={imageSearch}
                    onChange={(e) => setImageSearch(e.target.value)}
                    className="stage-article-modal-search-input"
                  />
                </div>

                <div className="stage-article-modal-grid">
                  {mediaAssets
                    .filter(img =>
                      img.filename.toLowerCase().includes(imageSearch.toLowerCase()) ||
                      img.alt?.toLowerCase().includes(imageSearch.toLowerCase())
                    )
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className={`stage-article-modal-image ${selectedFeaturedImage?.id === img.id ? 'selected' : ''}`}
                        onClick={() => {
                          updateStagedArticle({ featuredImageId: img.id })
                          setShowImageModal(false)
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={img.alt || img.filename}
                          loading="lazy"
                        />
                        <span className="stage-article-modal-image-name">{img.filename}</span>
                        {selectedFeaturedImage?.id === img.id && (
                          <div className="stage-article-modal-selected-badge">✓</div>
                        )}
                      </button>
                    ))}
                </div>

                {mediaAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>No images found in the media library.</p>
                  </div>
                )}

                <div className="stage-article-modal-footer">
                  <button
                    type="button"
                    className="stage-article-modal-done"
                    onClick={() => setShowImageModal(false)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stage-article-upload-section">
                  <div className="stage-article-upload-alt">
                    <label htmlFor="image-alt-text">Alt Text *</label>
                    <input
                      id="image-alt-text"
                      type="text"
                      placeholder="Describe the image for accessibility"
                      value={imageAltText}
                      onChange={(e) => setImageAltText(e.target.value)}
                      className="stage-article-modal-search-input"
                    />
                  </div>
                  <ImageUpload
                    externalRef={stagedArticle.id}
                    token={token || ''}
                    altText={imageAltText}
                    onUploadComplete={handleUploadComplete}
                    onCancel={() => setShowUploadModal(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block Image Selection Modal */}
      {blockImageModal?.show && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={() => setBlockImageModal(null)}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>{showBlockUploadModal ? 'Upload New Image' : 'Add Image Between Blocks'}</h3>
              <button
                type="button"
                className="stage-article-modal-close"
                onClick={() => {
                  if (showBlockUploadModal) {
                    setShowBlockUploadModal(false)
                  } else {
                    setBlockImageModal(null)
                  }
                }}
              >
                ×
              </button>
            </div>

            {!showBlockUploadModal ? (
              <>
                <div className="stage-article-modal-actions">
                  <button
                    type="button"
                    className="stage-article-modal-upload-btn"
                    onClick={() => setShowBlockUploadModal(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload New Image
                  </button>
                </div>

                <div className="stage-article-modal-search">
                  <input
                    type="text"
                    placeholder="Search images..."
                    value={blockImageSearch}
                    onChange={(e) => setBlockImageSearch(e.target.value)}
                    className="stage-article-modal-search-input"
                  />
                </div>

                <div className="stage-article-modal-grid">
                  {mediaAssets
                    .filter(img =>
                      img.filename.toLowerCase().includes(blockImageSearch.toLowerCase()) ||
                      img.alt?.toLowerCase().includes(blockImageSearch.toLowerCase())
                    )
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className="stage-article-modal-image"
                        onClick={() => {
                          addImageAfterBlock(blockImageModal.blockId, img.id)
                          setBlockImageModal(null)
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={img.alt || img.filename}
                          loading="lazy"
                        />
                        <span className="stage-article-modal-image-name">{img.filename}</span>
                      </button>
                    ))}
                </div>

                {mediaAssets.length === 0 && (
                  <div className="stage-article-modal-empty">
                    <p>No images found in the media library.</p>
                  </div>
                )}

                <div className="stage-article-modal-footer">
                  <button
                    type="button"
                    className="stage-article-modal-done"
                    onClick={() => setBlockImageModal(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="stage-article-upload-section">
                  <div className="stage-article-upload-alt">
                    <label htmlFor="block-image-alt-text">Alt Text *</label>
                    <input
                      id="block-image-alt-text"
                      type="text"
                      placeholder="Describe the image for accessibility"
                      value={blockImageAltText}
                      onChange={(e) => setBlockImageAltText(e.target.value)}
                      className="stage-article-modal-search-input"
                    />
                  </div>
                  <ImageUpload
                    externalRef={`${stagedArticle.id}_block_${blockImageModal.blockId}`}
                    token={token || ''}
                    altText={blockImageAltText}
                    onUploadComplete={handleBlockImageUploadComplete}
                    onCancel={() => setShowBlockUploadModal(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
