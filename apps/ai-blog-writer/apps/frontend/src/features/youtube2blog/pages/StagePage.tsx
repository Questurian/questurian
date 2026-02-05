import { useState, useEffect } from 'react'
import { useAuth } from '../../../providers/AuthProvider'
import { 
  fetchLocations, 
  fetchArticleCategories, 
  fetchArticleTags,
  type Location,
  type ArticleCategory,
  type ArticleTag,
  type CreateArticlePayload,
  createArticle,
} from '../api'
import '../styles/stage.css'

type StagedItem = {
  id: string
  title: string
  content: string
  originalMarkdown?: string
  status: 'draft' | 'ready' | 'published' | 'error'
  selectedLocation?: Location
  selectedCategory?: ArticleCategory
  selectedTags: ArticleTag[]
  error?: string
}

export default function StagePage() {
  const { token, user } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<ArticleCategory[]>([])
  const [tags, setTags] = useState<ArticleTag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Search filters
  const [locationSearch, setLocationSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  
  // Staged items (articles ready to be published)
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([])
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResults, setPublishResults] = useState<Array<{ id: string; success: boolean; message: string }>>([])

  // Fetch reference data from Payload CMS
  useEffect(() => {
    if (!token) return
    
    const loadReferenceData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const [locationsRes, categoriesRes, tagsRes] = await Promise.all([
          fetchLocations(token, { limit: 200 }),
          fetchArticleCategories(token, { limit: 100, status: 'active' }),
          fetchArticleTags(token, { limit: 100, status: 'active' }),
        ])
        
        setLocations(locationsRes.docs || [])
        setCategories(categoriesRes.docs || [])
        setTags(tagsRes.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reference data')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadReferenceData()
  }, [token])

  // Load staged items from localStorage (or create sample ones for testing)
  useEffect(() => {
    const saved = localStorage.getItem('youtube2blog_staged_items')
    if (saved) {
      try {
        setStagedItems(JSON.parse(saved))
      } catch {
        // Create sample items if parsing fails
        createSampleItems()
      }
    } else {
      createSampleItems()
    }
  }, [])

  const createSampleItems = () => {
    // Sample staged items for testing
    const sampleItems: StagedItem[] = [
      {
        id: 'stage-1',
        title: 'Exploring the Ancient Ruins of Cusco',
        content: 'This is a sample article about Cusco that needs location selection.',
        status: 'draft',
        selectedTags: [],
      },
      {
        id: 'stage-2',
        title: 'Best Restaurants in Lima',
        content: 'A guide to the best culinary experiences in Lima.',
        status: 'draft',
        selectedTags: [],
      },
    ]
    setStagedItems(sampleItems)
    localStorage.setItem('youtube2blog_staged_items', JSON.stringify(sampleItems))
  }

  const updateStagedItem = (id: string, updates: Partial<StagedItem>) => {
    setStagedItems(prev => {
      const updated = prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
      localStorage.setItem('youtube2blog_staged_items', JSON.stringify(updated))
      return updated
    })
  }

  const handlePublish = async (item: StagedItem) => {
    if (!token || !item.selectedLocation) {
      updateStagedItem(item.id, { 
        status: 'error', 
        error: 'Please select a location before publishing' 
      })
      return
    }

    setIsPublishing(true)
    
    try {
      // Build the article payload
      const locationName = item.selectedLocation.neighborhoodName || 
                          item.selectedLocation.cityName || 
                          item.selectedLocation.countryName || 
                          item.selectedLocation.locationKey
      const payload: CreateArticlePayload = {
        title: item.title,
        location: locationName,
        locationRef: item.selectedLocation.id,
        step1_complete: true,
        status: 'draft', // Start as draft, can publish later
        category: item.selectedCategory?.id,
        tags: item.selectedTags.map(t => t.id),
      }

      const result = await createArticle(payload, token)
      
      updateStagedItem(item.id, { status: 'published' })
      setPublishResults(prev => [...prev, { 
        id: item.id, 
        success: true, 
        message: `Article created with ID: ${result.id}` 
      }])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to publish'
      updateStagedItem(item.id, { status: 'error', error: errorMessage })
      setPublishResults(prev => [...prev, { 
        id: item.id, 
        success: false, 
        message: errorMessage 
      }])
    } finally {
      setIsPublishing(false)
    }
  }

  // Filter functions
  const filteredLocations = locations.filter(loc => {
    const displayName = loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
    return displayName?.toLowerCase().includes(locationSearch.toLowerCase()) ||
           loc.locationKey?.toLowerCase().includes(locationSearch.toLowerCase())
  })

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(categoryFilter.toLowerCase())
  )

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(tagSearch.toLowerCase()) ||
    tag.displayName?.toLowerCase().includes(tagSearch.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="stage-page">
        <div className="stage-loading">
          <div className="stage-spinner" />
          <p>Loading reference data from Payload CMS...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stage-page">
        <div className="stage-error">
          <h2>Failed to Load Data</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="stage-button">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-page">
      <header className="stage-header">
        <h1>Stage Articles</h1>
        <p className="stage-subtitle">
          Select locations, categories, and tags for your articles before publishing to Payload CMS
        </p>
      </header>

      <div className="stage-stats">
        <div className="stage-stat">
          <span className="stage-stat-value">{locations.length}</span>
          <span className="stage-stat-label">Locations</span>
        </div>
        <div className="stage-stat">
          <span className="stage-stat-value">{categories.length}</span>
          <span className="stage-stat-label">Categories</span>
        </div>
        <div className="stage-stat">
          <span className="stage-stat-value">{tags.length}</span>
          <span className="stage-stat-label">Tags</span>
        </div>
        <div className="stage-stat">
          <span className="stage-stat-value">{stagedItems.length}</span>
          <span className="stage-stat-label">Staged Items</span>
        </div>
      </div>

      <section className="stage-section">
        <h2>Reference Data</h2>
        
        <div className="stage-reference-grid">
          {/* Locations */}
          <div className="stage-reference-card">
            <h3>📍 Locations ({filteredLocations.length})</h3>
            <input
              type="text"
              placeholder="Search locations..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="stage-search-input"
            />
            <div className="stage-reference-list">
              {filteredLocations.slice(0, 50).map(loc => {
                const displayName = loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
                return (
                  <div key={loc.id} className="stage-reference-item">
                    <span className="stage-reference-name">{displayName}</span>
                    <span className="stage-reference-meta">{loc.level}</span>
                  </div>
                )
              })}
              {filteredLocations.length > 50 && (
                <div className="stage-reference-more">
                  +{filteredLocations.length - 50} more
                </div>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="stage-reference-card">
            <h3>📂 Categories ({filteredCategories.length})</h3>
            <input
              type="text"
              placeholder="Filter categories..."
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="stage-search-input"
            />
            <div className="stage-reference-list">
              {filteredCategories.map(cat => (
                <div key={cat.id} className="stage-reference-item">
                  <span className="stage-reference-name">{cat.name}</span>
                  <span className="stage-reference-meta">ID: {cat.id}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="stage-reference-card">
            <h3>🏷️ Tags ({filteredTags.length})</h3>
            <input
              type="text"
              placeholder="Search tags..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="stage-search-input"
            />
            <div className="stage-reference-list">
              {filteredTags.slice(0, 30).map(tag => (
                <div key={tag.id} className="stage-reference-item">
                  <span className="stage-reference-name">
                    {tag.displayName || tag.name}
                  </span>
                  <span className="stage-reference-meta">ID: {tag.id}</span>
                </div>
              ))}
              {filteredTags.length > 30 && (
                <div className="stage-reference-more">
                  +{filteredTags.length - 30} more
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="stage-section">
        <h2>Staged Articles</h2>
        
        {stagedItems.length === 0 ? (
          <div className="stage-empty">
            <p>No articles staged yet.</p>
            <p className="stage-hint">
              Articles will appear here after processing in the YouTube2Blog pipeline.
            </p>
          </div>
        ) : (
          <div className="stage-items">
            {stagedItems.map(item => (
              <div 
                key={item.id} 
                className={`stage-item stage-item--${item.status}`}
              >
                <div className="stage-item-header">
                  <h3 className="stage-item-title">{item.title}</h3>
                  <span className={`stage-item-status stage-item-status--${item.status}`}>
                    {item.status}
                  </span>
                </div>

                <p className="stage-item-preview">{item.content}</p>

                {item.error && (
                  <div className="stage-item-error">{item.error}</div>
                )}

                <div className="stage-item-fields">
                  {/* Location Selector */}
                  <div className="stage-field">
                    <label>Location *</label>
                    <select
                      value={item.selectedLocation?.id || ''}
                      onChange={(e) => {
                        const loc = locations.find(l => l.id === Number(e.target.value))
                        updateStagedItem(item.id, { selectedLocation: loc })
                      }}
                      className="stage-select"
                    >
                      <option value="">Select a location...</option>
                      {locations.map(loc => {
                        const displayName = loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
                        return (
                          <option key={loc.id} value={loc.id}>
                            {displayName} ({loc.level})
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* Category Selector */}
                  <div className="stage-field">
                    <label>Category</label>
                    <select
                      value={item.selectedCategory?.id || ''}
                      onChange={(e) => {
                        const cat = categories.find(c => c.id === Number(e.target.value))
                        updateStagedItem(item.id, { selectedCategory: cat })
                      }}
                      className="stage-select"
                    >
                      <option value="">Select a category...</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tags Selector */}
                  <div className="stage-field">
                    <label>Tags (max 10)</label>
                    <div className="stage-tags-selector">
                      {tags.slice(0, 20).map(tag => (
                        <label key={tag.id} className="stage-tag-checkbox">
                          <input
                            type="checkbox"
                            checked={item.selectedTags.some(t => t.id === tag.id)}
                            onChange={(e) => {
                              const newTags = e.target.checked
                                ? [...item.selectedTags, tag].slice(0, 10)
                                : item.selectedTags.filter(t => t.id !== tag.id)
                              updateStagedItem(item.id, { selectedTags: newTags })
                            }}
                          />
                          <span>{tag.displayName || tag.name}</span>
                        </label>
                      ))}
                    </div>
                    {item.selectedTags.length > 0 && (
                      <div className="stage-selected-tags">
                        Selected: {item.selectedTags.map(t => t.displayName || t.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="stage-item-actions">
                  <button
                    onClick={() => handlePublish(item)}
                    disabled={isPublishing || !item.selectedLocation || item.status === 'published'}
                    className="stage-button stage-button--primary"
                  >
                    {item.status === 'published' ? 'Published' : 
                     isPublishing ? 'Publishing...' : 'Publish to Payload'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {publishResults.length > 0 && (
        <section className="stage-section">
          <h2>Publish Results</h2>
          <div className="stage-results">
            {publishResults.map((result, idx) => (
              <div 
                key={idx} 
                className={`stage-result stage-result--${result.success ? 'success' : 'error'}`}
              >
                <span className="stage-result-icon">
                  {result.success ? '✓' : '✗'}
                </span>
                <span className="stage-result-message">{result.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="stage-debug">
        <h3>Current User</h3>
        <pre>{JSON.stringify({ email: user?.email, role: user?.role }, null, 2)}</pre>
      </div>
    </div>
  )
}
