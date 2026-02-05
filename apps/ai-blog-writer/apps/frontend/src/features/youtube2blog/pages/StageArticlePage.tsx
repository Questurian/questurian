import { useState, useEffect } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../providers/AuthProvider'
import { 
  fetchLocations, 
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  type Location,
  type MediaAsset,
} from '../api'
import '../styles/stage-article.css'

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

export default function StageArticlePage() {
  const { token, user } = useAuth()
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
  
  // Modal state
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSearch, setImageSearch] = useState('')
  
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
          setStagedArticle(existing)
        } else {
          setError('Staged article not found')
        }
      } else if (urlRunId) {
        // Check if already staged
        const existing = allStaged.find(s => s.runId === urlRunId)
        if (existing) {
          setStagedArticle(existing)
          // Update URL to use stagedId
          navigate(`/youtube2blog/stage-article?stagedId=${existing.id}`, { replace: true })
        } else {
          // Create new staged article
          const newStaged: StagedArticle = {
            id: `staged_${Date.now()}`,
            runId: urlRunId,
            originalTitle: urlTitle,
            originalContent: urlContent,
            originalType: urlType,
            title: urlTitle,
            content: urlContent,
            lexicalConverted: false,
            publishedToPayload: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          
          // Auto-convert to Lexical
          convertContentToLexical(newStaged)
          
          // Save to storage
          const updated = [...allStaged, newStaged]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
          
          setStagedArticle(newStaged)
          // Update URL
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

  const convertContentToLexical = async (article: StagedArticle) => {
    if (!article.content || article.lexicalConverted) return
    
    setIsConverting(true)
    try {
      const result = await convertMarkdownToLexical(article.content)
      if (result.success && result.data) {
        updateStagedArticle({
          lexicalConverted: true,
          lexicalData: result.data,
        })
      }
    } catch (err) {
      console.error('Lexical conversion failed:', err)
    } finally {
      setIsConverting(false)
    }
  }

  const updateStagedArticle = (updates: Partial<StagedArticle>) => {
    setStagedArticle(prev => {
      if (!prev) return null
      const updated = { ...prev, ...updates, updatedAt: new Date().toISOString() }
      
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
  }

  const handleSaveEdits = () => {
    setIsEditing(false)
    // Re-convert if content changed
    if (stagedArticle) {
      convertContentToLexical(stagedArticle)
    }
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
    
    try {
      // Build payload with Lexical content if available
      const contentBlocks = stagedArticle.lexicalConverted && stagedArticle.lexicalData
        ? [{ blockType: 'text' as const, content: stagedArticle.lexicalData }]
        : undefined
      
      const result = await createArticle({
        title: stagedArticle.title || 'Untitled Article',
        locationRef: location.id,
        step1_complete: true,
        status: 'draft',
        headerSection: {
          featuredImage: featuredImage.id,
        },
        ...(contentBlocks && { contentBlocks }),
      }, token)
      
      // Update staged article with publish status
      updateStagedArticle({
        publishedToPayload: true,
        payloadArticleId: result.id,
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

  const getLocationDisplayName = (loc?: Location) => {
    if (!loc) return ''
    return loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
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
                title={isEditing ? 'Save changes' : 'Edit title & content'}
              >
                {isEditing ? '✓ Save' : '✎ Edit'}
              </button>
            )}
            <button 
              className="stage-article-icon-btn danger"
              onClick={handleDelete}
              title="Delete staged article"
            >
              🗑
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
          
          {/* Status Badges */}
          <div className="stage-article-status-badges">
            {isConverting && (
              <span className="stage-article-badge converting">
                <span className="stage-article-badge-spinner" />
                Converting...
              </span>
            )}
            {stagedArticle.lexicalConverted && (
              <span className="stage-article-badge converted">✓ Lexical</span>
            )}
            {stagedArticle.publishedToPayload && (
              <span className="stage-article-badge published">✓ Published #{stagedArticle.payloadArticleId}</span>
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
                src={selectedFeaturedImage.url || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${selectedFeaturedImage.filename}`}
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
              ✓ {getLocationDisplayName(selectedLocation)}
            </div>
          )}
        </div>

        {/* Editable Content */}
        <div className="stage-article-section">
          <label className="stage-article-label">
            Article Content
          </label>
          {isEditing ? (
            <textarea
              className="stage-article-content-textarea"
              value={stagedArticle.content}
              onChange={(e) => updateStagedArticle({ content: e.target.value })}
              rows={10}
              placeholder="Article content in Markdown..."
            />
          ) : (
            <details className="stage-article-preview-details">
              <summary>
                <span>Preview Content</span>
                <span className="stage-article-preview-meta">{stagedArticle.content.length} chars</span>
              </summary>
              <div className="stage-article-preview-content">
                <pre>{stagedArticle.content}</pre>
              </div>
            </details>
          )}
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
              ✓ Published to Payload CMS
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
            {publishResult.success ? '✓' : '✗'} {publishResult.message}
          </div>
        )}
      </div>

      {/* Image Selection Modal */}
      {showImageModal && !stagedArticle.publishedToPayload && (
        <div className="stage-article-modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="stage-article-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stage-article-modal-header">
              <h3>Select Featured Image</h3>
              <button 
                type="button"
                className="stage-article-modal-close"
                onClick={() => setShowImageModal(false)}
              >
                ×
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
                      src={img.url || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${img.filename}`}
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
          </div>
        </div>
      )}
    </div>
  )
}
