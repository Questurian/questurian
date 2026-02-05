import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../../../providers/AuthProvider'
import { 
  fetchLocations, 
  fetchMediaAssets,
  createArticle,
  type Location,
  type MediaAsset,
} from '../api'
import '../styles/stage-article.css'

export default function StageArticlePage() {
  const { token, user } = useAuth()
  const [searchParams] = useSearchParams()
  
  // Get article data from URL params
  const articleTitle = searchParams.get('title') || ''
  const articleContent = searchParams.get('content') || ''
  const articleType = searchParams.get('type') || ''
  const runId = searchParams.get('runId') || ''
  
  // Reference data
  const [locations, setLocations] = useState<Location[]>([])
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [selectedFeaturedImage, setSelectedFeaturedImage] = useState<MediaAsset | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Modal state
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSearch, setImageSearch] = useState('')

  // Load reference data
  useEffect(() => {
    if (!token) return
    
    const loadData = async () => {
      setIsLoading(true)
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

  const handlePublish = async () => {
    if (!token || !selectedLocation) {
      setPublishResult({ success: false, message: 'Please select a location' })
      return
    }

    setIsPublishing(true)
    setPublishResult(null)
    
    try {
      // Simplified payload - ONLY send locationRef (not location text)
      // The syncLocationFields hook will auto-populate location from locationRef
      // Author is auto-set by backend from JWT
      const result = await createArticle({
        title: articleTitle || 'Untitled Article',
        locationRef: selectedLocation.id,
        step1_complete: true,
        status: 'draft',
        ...(selectedFeaturedImage && {
          headerSection: {
            featuredImage: selectedFeaturedImage.id,
          },
        }),
      }, token)
      
      setPublishResult({ 
        success: true, 
        message: `Article created successfully! ID: ${result.id}` 
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

  const getLocationDisplayName = (loc: Location) => {
    return loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
  }

  if (isLoading) {
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

  return (
    <div className="stage-article-page">
      <header className="stage-article-header">
        <p className="stage-article-eyebrow">Stage Article for Payload</p>
        <h1>Add Required Fields & Publish</h1>
        <p className="stage-article-subtitle">
          Select location and featured image before publishing to Payload CMS
        </p>
      </header>

      <div className="stage-article-layout">
        {/* Left: Article Preview */}
        <div className="stage-article-preview">
          <h2>Article Preview</h2>
          <div className="stage-article-card">
            <h3>{articleTitle || 'Untitled'}</h3>
            {articleType && <span className="stage-article-type">{articleType}</span>}
            <p className="stage-article-content-preview">
              {articleContent.slice(0, 300)}{articleContent.length > 300 ? '...' : ''}
            </p>
            <div className="stage-article-meta">
              <span>Run ID: {runId}</span>
              <span>{articleContent.length} chars</span>
            </div>
          </div>
        </div>

        {/* Right: Field Selection */}
        <div className="stage-article-fields">
          <h2>Required Fields</h2>
          
          {/* Location - Required */}
          <div className="stage-article-field">
            <label>
              Location *
              <span className="stage-article-hint">Select where this article is about</span>
            </label>
            <select
              value={selectedLocation?.id || ''}
              onChange={(e) => {
                const loc = locations.find(l => l.id === Number(e.target.value))
                setSelectedLocation(loc || null)
              }}
              className="stage-article-select"
            >
              <option value="">-- Choose a location --</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {getLocationDisplayName(loc)} ({loc.level})
                </option>
              ))}
            </select>
            {selectedLocation && (
              <div className="stage-article-selected">
                Selected: <strong>{getLocationDisplayName(selectedLocation)}</strong>
              </div>
            )}
          </div>

          {/* Featured Image - Required */}
          <div className="stage-article-field">
            <label>
              Featured Image *
              <span className="stage-article-hint">Select a hero image from the media library</span>
            </label>
            
            {selectedFeaturedImage ? (
              <div className="stage-article-image-preview">
                <img 
                  src={selectedFeaturedImage.url || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${selectedFeaturedImage.filename}`}
                  alt={selectedFeaturedImage.alt || selectedFeaturedImage.filename}
                  className="stage-article-selected-image"
                />
                <div className="stage-article-image-info">
                  <span className="stage-article-image-name">{selectedFeaturedImage.filename}</span>
                  <button 
                    type="button"
                    onClick={() => setShowImageModal(true)}
                    className="stage-article-change-image"
                  >
                    Change Image
                  </button>
                </div>
              </div>
            ) : (
              <button 
                type="button"
                onClick={() => setShowImageModal(true)}
                className="stage-article-select-image-btn"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Select Featured Image
              </button>
            )}
          </div>

          <div className="stage-article-note">
            <p>💡 <strong>Note:</strong> Author will be automatically set based on your login.</p>
          </div>

          {/* Actions */}
          <div className="stage-article-actions">
            <button
              onClick={handlePublish}
              disabled={isPublishing || !selectedLocation}
              className="stage-article-publish-btn"
            >
              {isPublishing ? 'Publishing...' : 'Publish to Payload'}
            </button>
            <Link to="/youtube2blog/articles" className="stage-article-cancel">
              Cancel
            </Link>
          </div>

          {/* Result */}
          {publishResult && (
            <div className={`stage-article-result ${publishResult.success ? 'success' : 'error'}`}>
              {publishResult.success ? '✓' : '✗'} {publishResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Image Selection Modal */}
      {showImageModal && (
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
                      setSelectedFeaturedImage(img)
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
