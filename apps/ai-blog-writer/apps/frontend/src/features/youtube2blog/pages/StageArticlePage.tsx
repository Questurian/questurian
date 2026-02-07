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
  fetchResult,
  markArticleSynced,
  type Location,
  type MediaAsset,
} from '../api'
import '../styles/stage-article.css'

// Block type for parsed markdown sections
export type ContentBlock = {
  id: string
  type: 'text' | 'pullquote'
  content: string // Markdown content (header + body) or pull quote text
  imageAfter?: number // Media asset ID for image between this and next block
  imageAfterAltText?: string
}

type MediaVariant = 'thumbnail' | 'square' | 'wide' | 'portrait' | 'hero'

const CONTENT_BLOCK_VARIANT: MediaVariant = 'wide'
const FEATURED_IMAGE_VARIANT: MediaVariant = 'hero'

const VARIANT_FALLBACK_ORDER: MediaVariant[] = [
  'wide',
  'hero',
  'square',
  'portrait',
  'thumbnail',
]

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
function stripLeadingH1(markdown: string): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  if (!/^#\s+/.test(lines[0].trimStart())) {
    return markdown.trim()
  }

  let contentStart = 1
  while (contentStart < lines.length && lines[contentStart].trim() === '') {
    contentStart++
  }

  return lines.slice(contentStart).join('\n').trim()
}

function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  // Title is managed separately in the staging UI; keep blocks body-only.
  const lines = stripLeadingH1(markdown).split('\n')
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
        type: 'text',
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
        type: 'text',
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

function normalizeBlocks(blocks: ContentBlock[] | undefined, fallbackContent: string): ContentBlock[] {
  if (!blocks || blocks.length === 0) {
    return parseMarkdownToBlocks(fallbackContent)
  }

  // Phase 1 contract only publishes text/image blocks.
  return blocks.map((block, index) => ({
    id: block.id || `block_${index}`,
    type: 'text',
    content: block.content || '',
    imageAfter: block.imageAfter,
    imageAfterAltText: block.imageAfterAltText,
  }))
}

function getMediaAssetAltText(img?: MediaAsset | null): string {
  if (!img) return ''
  return img.alt_text?.trim() || img.alt?.trim() || img.altText?.trim() || ''
}

function getRelationshipId(
  value: MediaAsset['mediaSet']
): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && 'id' in value) {
    const id = value.id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

function pickVariantAssetId(
  variantAssetIds: UploadImageResponse['variantAssetIds'],
  preferredVariant: MediaVariant
): number | null {
  if (!variantAssetIds) return null

  const orderedVariants: MediaVariant[] = [
    preferredVariant,
    ...VARIANT_FALLBACK_ORDER.filter(variant => variant !== preferredVariant),
  ]

  for (const variant of orderedVariants) {
    const rawId = variantAssetIds[variant]
    if (!rawId) continue
    const numericId = Number(rawId)
    if (!Number.isNaN(numericId)) {
      return numericId
    }
  }

  return null
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

  // Drag and drop state
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)

  // Conversion state
  const [isConverting, setIsConverting] = useState(false)

  // Storage key
  const STORAGE_KEY = 'youtube2blog_staged_articles'

  // Load or create staged article
  useEffect(() => {
    if (!urlRunId && !stagedId) return

    let isCancelled = false

    const loadStagedArticle = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        const allStaged: StagedArticle[] = stored ? JSON.parse(stored) : []

        if (stagedId) {
          // Load existing staged article
          const existingIndex = allStaged.findIndex(s => s.id === stagedId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
            const normalizedBlocks = normalizeBlocks(existing.blocks, existing.content)
            const normalizedExisting = {
              ...existing,
              blocks: normalizedBlocks,
              content: blocksToMarkdown(normalizedBlocks),
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            if (blocksChanged) {
              allStaged[existingIndex] = normalizedExisting
              localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
            }
          } else if (!isCancelled) {
            setError('Staged article not found')
          }
        } else if (urlRunId) {
          // Check if already staged
          const existingIndex = allStaged.findIndex(s => s.runId === urlRunId)
          const existing = existingIndex >= 0 ? allStaged[existingIndex] : null
          if (existing) {
            const normalizedBlocks = normalizeBlocks(existing.blocks, existing.content)
            const normalizedExisting = {
              ...existing,
              blocks: normalizedBlocks,
              content: blocksToMarkdown(normalizedBlocks),
            }

            if (!isCancelled) {
              setStagedArticle(normalizedExisting)
            }

            const blocksChanged = JSON.stringify(existing.blocks) !== JSON.stringify(normalizedBlocks)
            if (blocksChanged) {
              allStaged[existingIndex] = normalizedExisting
              localStorage.setItem(STORAGE_KEY, JSON.stringify(allStaged))
            }

            navigate(`/youtube2blog/stage-article?stagedId=${existing.id}`, { replace: true })
          } else {
            let markdown = urlContent
            if (!markdown) {
              const result = await fetchResult(urlRunId)
              markdown = result.markdown || ''
            }

            if (!markdown.trim()) {
              if (!isCancelled) {
                setError('Unable to load article content for staging')
              }
              return
            }

            // Create new staged article
            const blocks = parseMarkdownToBlocks(markdown)
            const newStaged: StagedArticle = {
              id: `staged_${Date.now()}`,
              runId: urlRunId,
              originalTitle: urlTitle,
              originalContent: markdown,
              originalType: urlType,
              title: urlTitle,
              content: markdown,
              blocks,
              lexicalConverted: false,
              publishedToPayload: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            // Save to storage
            const updated = [...allStaged, newStaged]
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

            if (!isCancelled) {
              setStagedArticle(newStaged)
            }
            navigate(`/youtube2blog/stage-article?stagedId=${newStaged.id}`, { replace: true })
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load staged article')
        }
      }
    }

    void loadStagedArticle()
    return () => {
      isCancelled = true
    }
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

  const addImageAfterBlock = useCallback((blockId: string, imageId: number, imageAfterAltText?: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId
        ? {
            ...b,
            imageAfter: imageId,
            imageAfterAltText: imageAfterAltText?.trim() || undefined,
          }
        : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const removeImageAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map(b =>
      b.id === blockId ? { ...b, imageAfter: undefined, imageAfterAltText: undefined } : b
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const mergeWithNextBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (blockIndex === -1 || blockIndex >= stagedArticle.blocks.length - 1) return

    const currentBlock = stagedArticle.blocks[blockIndex]
    const nextBlock = stagedArticle.blocks[blockIndex + 1]

    // Warn if there's an image between the blocks that will be deleted
    if (currentBlock.imageAfter) {
      if (!confirm('This will delete the image between these blocks. Continue?')) {
        return
      }
    }

    // Merge content, removing any image that was between them
    const mergedBlock: ContentBlock = {
      id: currentBlock.id,
      type: 'text',
      content: `${currentBlock.content}\n\n${nextBlock.content}`,
      imageAfter: nextBlock.imageAfter, // Keep only the image after the second block
      imageAfterAltText: nextBlock.imageAfterAltText,
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
      { id: block.id, type: 'text', content: beforeContent },
      {
        id: `block_${Date.now()}`,
        type: 'text',
        content: afterContent,
        imageAfter: block.imageAfter,
        imageAfterAltText: block.imageAfterAltText,
      },
    ]

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      ...newBlocks,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const addNewBlock = useCallback((afterBlockId?: string) => {
    if (!stagedArticle) return

    const newBlock: ContentBlock = {
      id: `block_${Date.now()}`,
      type: 'text',
      content: '## New Section\n\nAdd your content here...',
    }

    let updatedBlocks: ContentBlock[]

    if (afterBlockId) {
      const blockIndex = stagedArticle.blocks.findIndex(b => b.id === afterBlockId)
      if (blockIndex === -1) return
      updatedBlocks = [
        ...stagedArticle.blocks.slice(0, blockIndex + 1),
        newBlock,
        ...stagedArticle.blocks.slice(blockIndex + 1),
      ]
    } else {
      // Add at the end
      updatedBlocks = [...stagedArticle.blocks, newBlock]
    }

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
    setIsEditing(true) // Enter edit mode so they can edit the new block
  }, [stagedArticle, updateStagedArticle])

  const deleteBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    if (stagedArticle.blocks.length <= 1) {
      alert('Cannot delete the last block.')
      return
    }

    const block = stagedArticle.blocks.find(b => b.id === blockId)
    if (!block) return

    const hasImage = block.imageAfter
    const message = hasImage
      ? 'Delete this block and its image?'
      : 'Delete this block?'

    if (!confirm(message)) return

    const updatedBlocks = stagedArticle.blocks.filter(b => b.id !== blockId)
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, blockId: string) => {
    setDraggedBlockId(blockId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', blockId)
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      const element = document.querySelector(`[data-block-id="${blockId}"]`)
      if (element) {
        element.classList.add('dragging')
      }
    }, 0)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedBlockId(null)
    setDragOverBlockId(null)
    // Remove dragging class from all blocks
    document.querySelectorAll('.block-editor-item').forEach(el => {
      el.classList.remove('dragging')
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, blockId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (blockId !== draggedBlockId) {
      setDragOverBlockId(blockId)
    }
  }, [draggedBlockId])

  const handleDragLeave = useCallback(() => {
    setDragOverBlockId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetBlockId: string) => {
    e.preventDefault()
    if (!stagedArticle || !draggedBlockId || draggedBlockId === targetBlockId) {
      setDraggedBlockId(null)
      setDragOverBlockId(null)
      return
    }

    const blocks = [...stagedArticle.blocks]
    const draggedIndex = blocks.findIndex(b => b.id === draggedBlockId)
    const targetIndex = blocks.findIndex(b => b.id === targetBlockId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Remove the dragged block
    const [draggedBlock] = blocks.splice(draggedIndex, 1)

    // Insert at the new position
    const newTargetIndex = targetIndex > draggedIndex ? targetIndex : targetIndex
    blocks.splice(newTargetIndex, 0, draggedBlock)

    updateStagedArticle({ blocks, lexicalConverted: false })
    setDraggedBlockId(null)
    setDragOverBlockId(null)
  }, [stagedArticle, draggedBlockId, updateStagedArticle])

  const moveBlockUp = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const index = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (index <= 0) return

    const blocks = [...stagedArticle.blocks]
    const temp = blocks[index]
    blocks[index] = blocks[index - 1]
    blocks[index - 1] = temp

    updateStagedArticle({ blocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const moveBlockDown = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const index = stagedArticle.blocks.findIndex(b => b.id === blockId)
    if (index === -1 || index >= stagedArticle.blocks.length - 1) return

    const blocks = [...stagedArticle.blocks]
    const temp = blocks[index]
    blocks[index] = blocks[index + 1]
    blocks[index + 1] = temp

    updateStagedArticle({ blocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const handleSaveEdits = () => {
    setIsEditing(false)
  }

  const handlePublish = async () => {
    if (!token || !stagedArticle) return

    const trimmedTitle = stagedArticle.title.trim()
    const location = locations.find(l => l.id === stagedArticle.locationId)
    const featuredImage = mediaAssets.find(m => m.id === stagedArticle.featuredImageId)

    if (!trimmedTitle) {
      setPublishResult({
        success: false,
        message: 'Please enter an article title'
      })
      return
    }

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

      let textBlocksAdded = 0

      // Convert each markdown block to Lexical and interleave with images.
      for (const [index, block] of stagedArticle.blocks.entries()) {
        const markdown = block.content.trim()
        if (markdown) {
          const lexicalResult = await convertMarkdownToLexical(markdown)
          if (!lexicalResult.success || !lexicalResult.data) {
            throw new Error(
              lexicalResult.error || `Failed to convert block ${index + 1} to Lexical`
            )
          }

          contentBlocks.push({
            blockType: 'text',
            content: lexicalResult.data,
          })
          textBlocksAdded++
        }

        // Add image block if one exists after this block
        if (block.imageAfter) {
          const imageAsset = mediaAssets.find(m => m.id === block.imageAfter)
          const altText = (block.imageAfterAltText?.trim() || getMediaAssetAltText(imageAsset)).trim()
          if (!altText) {
            throw new Error(`Image after block ${index + 1} is missing alt text`)
          }

          contentBlocks.push({
            blockType: 'image',
            image: block.imageAfter,
            altText,
          })
        }
      }

      if (textBlocksAdded === 0) {
        throw new Error('Add at least one text block with content before publishing')
      }

      setIsConverting(false)

      const result = await createArticle({
        title: trimmedTitle,
        location: location.locationKey,
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

  const findPreferredVariantAsset = useCallback((assetId: number, preferredVariant: MediaVariant): MediaAsset | null => {
    const selectedAsset = mediaAssets.find(m => m.id === assetId)
    if (!selectedAsset) return null

    const mediaSetId = getRelationshipId(selectedAsset.mediaSet)
    if (mediaSetId === null || !selectedAsset.variant) {
      return selectedAsset
    }

    const preferred = mediaAssets.find(m => {
      const candidateMediaSetId = getRelationshipId(m.mediaSet)
      return candidateMediaSetId !== null
        && String(candidateMediaSetId) === String(mediaSetId)
        && m.variant === preferredVariant
    })

    return preferred || selectedAsset
  }, [mediaAssets])

  const handleUploadComplete = (result: UploadImageResponse) => {
    const featuredAssetId = pickVariantAssetId(result.variantAssetIds, FEATURED_IMAGE_VARIANT)
    if (featuredAssetId) {
      updateStagedArticle({ featuredImageId: featuredAssetId })
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

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (blockAssetId) {
      addImageAfterBlock(blockImageModal.blockId, blockAssetId, blockImageAltText)
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
  const hasTitle = Boolean(stagedArticle.title.trim())
  const allFieldsFilled = Boolean(selectedLocation && selectedFeaturedImage && hasTitle)
  const missingRequiredFields = [
    ...(!hasTitle ? ['title'] : []),
    ...(!selectedLocation ? ['location'] : []),
    ...(!selectedFeaturedImage ? ['featured image'] : []),
  ]

  return (
    <div className="stage-article-page">
      {/* Header */}
      <header className="stage-article-header">
        <div className="stage-article-header-left">
          <Link to="/youtube2blog/stage" className="stage-article-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Stage List
          </Link>
          <div className="stage-article-header-meta">
            <p className="stage-article-eyebrow">
              {stagedArticle.publishedToPayload ? 'Published to Payload' : 'Staging for Payload'}
            </p>
            {stagedArticle.originalType && (
              <span className="stage-article-type-badge">{stagedArticle.originalType}</span>
            )}
            <span className="stage-article-block-count">
              {stagedArticle.blocks.length} blocks
            </span>
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

        <div className="stage-article-actions-bar">
          {!stagedArticle.publishedToPayload && (
            <button
              className="stage-article-icon-btn"
              onClick={() => isEditing ? handleSaveEdits() : setIsEditing(true)}
              title={isEditing ? 'Save changes' : 'Edit blocks'}
            >
              {isEditing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
              {isEditing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            className="stage-article-icon-btn danger"
            onClick={handleDelete}
            title="Delete staged article"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
          </button>
        </div>
      </header>

      {/* Title Area */}
      <div className="stage-article-title-area">
        {isEditing ? (
          <input
            type="text"
            className="stage-article-title-input"
            value={stagedArticle.title}
            onChange={(e) => updateStagedArticle({ title: e.target.value })}
            placeholder="Article title..."
          />
        ) : (
          <h1 className="stage-article-title">{stagedArticle.title || 'Untitled Article'}</h1>
        )}
      </div>

      {/* Two-column layout */}
      <div className="stage-article-layout">
        {/* Main content - block editor */}
        <main className="stage-article-main">
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
                <div
                  key={block.id}
                  data-block-id={block.id}
                  className={`block-editor-item ${draggedBlockId === block.id ? 'dragging' : ''} ${dragOverBlockId === block.id ? 'drag-over' : ''}`}
                  draggable={!stagedArticle.publishedToPayload && !isEditing}
                  onDragStart={(e) => handleDragStart(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, block.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, block.id)}
                >
                  {/* Block Content */}
                  <div className={`block-card ${isEditing ? 'editing' : ''} ${block.type === 'pullquote' ? 'pullquote' : ''}`}>
                    <div className="block-card-header">
                      <div className="block-card-header-left">
                        {/* Drag Handle */}
                        {!stagedArticle.publishedToPayload && !isEditing && (
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
                        <span className="block-number">{index + 1}</span>
                        {block.type === 'pullquote' && (
                          <span className="block-type-badge">Pull Quote</span>
                        )}
                      </div>
                      <div className="block-card-header-right">
                        {/* Move buttons */}
                        {!stagedArticle.publishedToPayload && !isEditing && (
                          <div className="block-move-buttons">
                            <button
                              type="button"
                              className="block-move-btn"
                              onClick={() => moveBlockUp(block.id)}
                              disabled={index === 0}
                              title="Move up"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 15l-6-6-6 6"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="block-move-btn"
                              onClick={() => moveBlockDown(block.id)}
                              disabled={index === stagedArticle.blocks.length - 1}
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

                    {isEditing ? (
                      <textarea
                        className={`block-textarea ${block.type === 'pullquote' ? 'pullquote' : ''}`}
                        value={block.content}
                        onChange={(e) => updateBlockContent(block.id, e.target.value)}
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
                              <img src={getImageUrl(img)} alt={getMediaAssetAltText(img) || block.imageAfterAltText || ''} />
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

                  {/* Action Zone Between Blocks (fuse + add image + add block) */}
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

                        {/* Add Block Button */}
                        <button
                          type="button"
                          className="block-add-block-btn"
                          onClick={() => addNewBlock(block.id)}
                          title="Add new text block here"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Block
                        </button>

                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Block at End */}
              {!stagedArticle.publishedToPayload && (
                <button
                  type="button"
                  className="block-add-end-btn"
                  onClick={() => addNewBlock()}
                  title="Add new block at end"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Block
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="stage-article-sidebar">
          <div className="stage-article-sidebar-inner">
            {/* Publish / Status */}
            <div className="stage-article-sidebar-section stage-article-sidebar-publish">
              {!stagedArticle.publishedToPayload ? (
                <>
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || !allFieldsFilled}
                    className="stage-article-publish-btn"
                  >
                    {isPublishing ? 'Publishing...' :
                     !allFieldsFilled ? 'Complete fields below' :
                     'Publish to Payload'}
                  </button>
                  {!allFieldsFilled && (
                    <p className="stage-article-publish-hint">
                      Complete: {missingRequiredFields.join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <div className="stage-article-published-notice">
                  Published to Payload
                  {stagedArticle.payloadArticleId && (
                    <span> &middot; ID {stagedArticle.payloadArticleId}</span>
                  )}
                </div>
              )}

              {publishResult && (
                <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
                  {publishResult.message}
                </div>
              )}
            </div>

            {/* Featured Image */}
            <div className="stage-article-sidebar-section">
              <label className="stage-article-label">
                Featured Image <span className="required">*</span>
              </label>

              {selectedFeaturedImage ? (
                <div className="stage-article-featured-image">
                  <img
                    src={getImageUrl(selectedFeaturedImage)}
                    alt={getMediaAssetAltText(selectedFeaturedImage) || selectedFeaturedImage.filename}
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
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>Select image</span>
                </button>
              )}
            </div>

            {/* Location */}
            <div className="stage-article-sidebar-section">
              <label className="stage-article-label">
                Location <span className="required">*</span>
              </label>
              <select
                value={stagedArticle.locationId || ''}
                onChange={(e) => updateStagedArticle({ locationId: Number(e.target.value) || undefined })}
                className="stage-article-select"
                disabled={stagedArticle.publishedToPayload}
              >
                <option value="">-- Select --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {getLocationDisplayName(loc)} ({loc.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Info */}
            <div className="stage-article-sidebar-section stage-article-info-box">
              <p><strong>Run ID:</strong> {stagedArticle.runId}</p>
              <p><strong>Created:</strong> {new Date(stagedArticle.createdAt).toLocaleDateString()}</p>
              <p><strong>Updated:</strong> {new Date(stagedArticle.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </aside>
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
                    onClick={() => {
                      setImageAltText('')
                      setShowUploadModal(true)
                    }}
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
                      getMediaAssetAltText(img).toLowerCase().includes(imageSearch.toLowerCase())
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
                          alt={getMediaAssetAltText(img) || img.filename}
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
                  <ImageUpload
                    externalRef={stagedArticle.id}
                    token={token || ''}
                    altText={imageAltText}
                    onUploadComplete={handleUploadComplete}
                    onAltTextGenerated={(text) => setImageAltText(text)}
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
                    onClick={() => {
                      setBlockImageAltText('')
                      setShowBlockUploadModal(true)
                    }}
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
                      getMediaAssetAltText(img).toLowerCase().includes(blockImageSearch.toLowerCase())
                    )
                    .map(img => (
                      <button
                        key={img.id}
                        type="button"
                        className="stage-article-modal-image"
                        onClick={() => {
                          const preferredAsset = findPreferredVariantAsset(img.id, CONTENT_BLOCK_VARIANT)
                          if (!preferredAsset) return
                          addImageAfterBlock(
                            blockImageModal.blockId,
                            preferredAsset.id,
                            getMediaAssetAltText(preferredAsset)
                          )
                          setBlockImageModal(null)
                        }}
                      >
                        <img
                          src={getImageUrl(img)}
                          alt={getMediaAssetAltText(img) || img.filename}
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
                  <ImageUpload
                    externalRef={`${stagedArticle.id}_block_${blockImageModal.blockId}`}
                    token={token || ''}
                    altText={blockImageAltText}
                    onUploadComplete={handleBlockImageUploadComplete}
                    onAltTextGenerated={(text) => setBlockImageAltText(text)}
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
