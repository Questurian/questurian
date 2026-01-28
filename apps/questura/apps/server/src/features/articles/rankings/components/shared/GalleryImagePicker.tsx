/**
 * Gallery Image Picker Component
 *
 * Displays an item's gallery AND instagramGallery as a unified clickable grid,
 * allowing users to select which specific media (image or Instagram post) to display in the ranking block.
 *
 * How it works:
 * 1. Reads the selected item ID from sibling 'item' field via useFormFields
 * 2. Fetches item data from API to get both gallery images and Instagram posts
 * 3. Merges both galleries and displays as unified grid with type indicators
 * 4. Highlights currently selected media (from either gallery)
 * 5. Updates selectedGalleryIndex OR selectedInstagramIndex field (mutually exclusive)
 *
 * Used via collection-specific wrappers (DiningGalleryImagePicker, etc.)
 */

'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useFormFields, useField } from '@payloadcms/ui'
import { getMediaSetPreviewAsset } from '@/features/media/lib/media-set-preview'

type GalleryImagePickerProps = {
  path: string
  field: any
  collectionName: string // 'dining', 'accommodations', 'attractions', 'nightlife'
}

type MergedGalleryItem = {
  type: 'image' | 'instagram'
  index: number
  data: any
  imageUrl: string | null
}

const GalleryImagePicker: React.FC<GalleryImagePickerProps> = ({
  path,
  field,
  collectionName,
}) => {
  const [gallery, setGallery] = useState<any[]>([])
  const [instagramGallery, setInstagramGallery] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // Get both field values
  // Path pattern: "items.0.selectedGalleryIndices" (array) or "items.0.selectedInstagramIndex" (number)
  const pathParts = path.split('.')
  const basePath = pathParts.slice(0, -1).join('.')

  const galleryIndicesPath = `${basePath}.selectedGalleryIndices`
  const instagramIndexPath = `${basePath}.selectedInstagramIndex`

  const { value: galleryIndices, setValue: setGalleryIndices } = useField<number[]>({ path: galleryIndicesPath })
  const { value: instagramIndex, setValue: setInstagramIndex } = useField<number | null>({ path: instagramIndexPath })

  // Ensure galleryIndices is always an array (handle null/undefined)
  const safeGalleryIndices = useMemo(
    () => Array.isArray(galleryIndices) ? galleryIndices : [],
    [galleryIndices]
  )

  // Get sibling item field value (item ID)
  const itemId = useFormFields(([fields]) => {
    const itemPath = pathParts.slice(0, -1).concat('item').join('.')
    const itemValue = fields[itemPath]?.value

    if (typeof itemValue === 'number' || typeof itemValue === 'string') {
      return itemValue
    }
    if (typeof itemValue === 'object' && itemValue?.id) {
      return itemValue.id
    }
    return null
  })

  // Fetch both galleries when itemId changes
  useEffect(() => {
    if (!itemId) {
      setGallery([])
      setInstagramGallery([])
      return
    }

    console.log('[GalleryImagePicker] Fetching galleries for item:', itemId, 'from collection:', collectionName)

    setLoading(true)
    fetch(`/api/${collectionName}/${itemId}?depth=2`)
      .then(res => res.json())
      .then(data => {
        console.log('[GalleryImagePicker] Fetched item data:', data)
        setGallery(data.gallery || [])
        setInstagramGallery(data.instagramGallery || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('[GalleryImagePicker] Fetch error:', err)
        setLoading(false)
      })
  }, [itemId, collectionName])

  // Merge both galleries into unified array for display
  const mergedGallery = useMemo((): MergedGalleryItem[] => {
    const merged: MergedGalleryItem[] = []

    // Add regular images
    gallery.forEach((item, index) => {
      const previewAsset = getMediaSetPreviewAsset(item.image)
      merged.push({
        type: 'image',
        index,
        data: item,
        imageUrl: previewAsset?.url || null,
      })
    })

    // Add Instagram posts
    instagramGallery.forEach((item, index) => {
      merged.push({
        type: 'instagram',
        index,
        data: item,
        imageUrl: item.post?.previewImage?.url || null,
      })
    })

    return merged
  }, [gallery, instagramGallery])

  // Determine which item is selected
  const isItemSelected = (item: MergedGalleryItem): boolean => {
    if (item.type === 'image') {
      return safeGalleryIndices.includes(item.index)
    }
    if (item.type === 'instagram') {
      return instagramIndex === item.index
    }
    return false
  }

  // Handle item selection with multi-select for images
  const MAX_IMAGES = 5

  const handleSelect = (item: MergedGalleryItem) => {
    console.log('[GalleryImagePicker] Clicked:', item.type, 'at index:', item.index)

    if (item.type === 'image') {
      // Toggle selection for standard images
      const isSelected = safeGalleryIndices.includes(item.index)

      if (isSelected) {
        // Deselect: remove from array
        const newIndices = safeGalleryIndices.filter(idx => idx !== item.index)
        setGalleryIndices(newIndices)
        console.log('[GalleryImagePicker] Deselected image at index:', item.index)
      } else {
        // Select: add to array if under limit
        if (safeGalleryIndices.length >= MAX_IMAGES) {
          console.warn('[GalleryImagePicker] Maximum 5 images already selected')
          return
        }

        // Add to end to preserve selection order (no sort!)
        const newIndices = [...safeGalleryIndices, item.index]
        setGalleryIndices(newIndices)

        // Clear Instagram (mutual exclusivity)
        if (instagramIndex !== null) {
          setInstagramIndex(null)
          console.log('[GalleryImagePicker] Cleared Instagram selection')
        }

        console.log('[GalleryImagePicker] Selected image at index:', item.index, 'Total:', newIndices.length)
      }
    } else if (item.type === 'instagram') {
      // Instagram selection: clear all standard images, set single Instagram
      const isSelected = instagramIndex === item.index

      if (isSelected) {
        // Deselect Instagram
        setInstagramIndex(null)
        console.log('[GalleryImagePicker] Deselected Instagram')
      } else {
        // Select Instagram: clear all standard images
        setInstagramIndex(item.index)
        setGalleryIndices([])
        console.log('[GalleryImagePicker] Selected Instagram at index:', item.index, '(cleared standard images)')
      }
    }
  }

  // No item selected yet
  if (!itemId) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
        Select an item first to choose a gallery image
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
        Loading gallery images...
      </div>
    )
  }

  // No gallery images available
  if (mergedGallery.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
        No gallery images available for this item
      </div>
    )
  }

  // Calculate counts for button label
  const imageCount = gallery.length
  const instagramCount = instagramGallery.length
  const totalCount = mergedGallery.length
  const countLabel = instagramCount > 0
    ? `${imageCount} image${imageCount !== 1 ? 's' : ''}, ${instagramCount} Instagram`
    : `${imageCount} image${imageCount !== 1 ? 's' : ''}`

  // Single item - show same UI with button
  if (mergedGallery.length === 1) {
    const singleItem = mergedGallery[0]
    return (
      <div style={{ padding: '16px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <div style={{ marginBottom: isOpen ? '16px' : '0' }}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              padding: '10px 16px',
              backgroundColor: isOpen ? '#ef4444' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isOpen ? '#dc2626' : '#2563eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isOpen ? '#ef4444' : '#3b82f6'
            }}
          >
            <span>{isOpen ? 'Close Gallery Picker' : 'Pick Block Image'}</span>
            <span style={{ fontSize: '12px', opacity: 0.9 }}>(1 {singleItem.type})</span>
          </button>
        </div>

        {isOpen && (
          <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
              Only One Image Available
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              This item has only one gallery image (automatically selected)
            </div>
            <div style={{ display: 'inline-block', position: 'relative' }}>
              {/* Type badge for Instagram */}
              {singleItem.type === 'instagram' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: '#8b5cf6',
                    color: '#ffffff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    zIndex: 10,
                  }}
                >
                  IG
                </div>
              )}
              <img
                src={singleItem.imageUrl || ''}
                alt={singleItem.type === 'image' ? singleItem.data.altText : singleItem.data.post?.title || 'Gallery image'}
                style={{ width: '200px', height: '150px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #d1d5db' }}
              />
              {singleItem.type === 'image' && singleItem.data.altText && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                  {singleItem.data.altText}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Multiple items - show button to toggle gallery picker
  return (
    <div style={{ padding: '16px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      {/* Toggle Button */}
      <div style={{ marginBottom: isOpen ? '16px' : '0' }}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '10px 16px',
            backgroundColor: isOpen ? '#ef4444' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isOpen ? '#dc2626' : '#2563eb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isOpen ? '#ef4444' : '#3b82f6'
          }}
        >
          <span>{isOpen ? 'Close Gallery Picker' : 'Pick Block Image'}</span>
          <span style={{ fontSize: '12px', opacity: 0.9 }}>({countLabel})</span>
        </button>
      </div>

      {/* Gallery Grid */}
      {isOpen && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              Select Up to 5 Images (Order Matters - First = Featured)
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Click images in order of priority. First selected becomes the featured image.
              {instagramCount > 0 && ' (purple badge = Instagram post)'}
            </div>
          </div>

          {/* Max limit warning */}
          {safeGalleryIndices.length >= MAX_IMAGES && (
            <div style={{
              marginBottom: '12px',
              padding: '12px',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#92400e',
              fontWeight: 600
            }}>
              ⚠️ Maximum 5 images selected. Deselect an image to choose another.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
            {mergedGallery.map((item, displayIndex) => {
              const isSelected = isItemSelected(item)
              const isInstagram = item.type === 'instagram'
              const isDisabled = !isSelected && item.type === 'image' && safeGalleryIndices.length >= MAX_IMAGES

              // Calculate selection order (1-based)
              const selectionOrder = isSelected && item.type === 'image'
                ? safeGalleryIndices.indexOf(item.index) + 1
                : 0
              const isFeatured = selectionOrder === 1

              const borderColor = isSelected
                ? (isInstagram ? '#8b5cf6' : isFeatured ? '#f59e0b' : '#3b82f6')
                : isDisabled ? '#e5e7eb' : '#d1d5db'

              const borderWidth = isFeatured ? '4px' : isSelected ? '3px' : '2px'

              const backgroundColor = isSelected
                ? (isInstagram ? '#f3e8ff' : isFeatured ? '#fef3c7' : '#eff6ff')
                : '#ffffff'

              const opacity = isDisabled ? 0.4 : 1
              const cursorStyle = isDisabled ? 'not-allowed' : 'pointer'

              return (
                <div
                  key={`${item.type}-${item.index}`}
                  onClick={() => !isDisabled && handleSelect(item)}
                  style={{
                    cursor: cursorStyle,
                    border: `${borderWidth} solid ${borderColor}`,
                    borderRadius: '6px',
                    padding: '6px',
                    backgroundColor,
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    opacity,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.borderColor = '#9ca3af'
                      e.currentTarget.style.backgroundColor = '#f9fafb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isDisabled) {
                      e.currentTarget.style.borderColor = borderColor
                      e.currentTarget.style.backgroundColor = backgroundColor
                    }
                  }}
                >
                  {/* Selection order badge for standard images */}
                  {item.type === 'image' && selectionOrder > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        minWidth: '32px',
                        height: '32px',
                        padding: '0 8px',
                        backgroundColor: isFeatured ? '#f59e0b' : '#3b82f6',
                        border: `2px solid ${isFeatured ? '#d97706' : '#2563eb'}`,
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      }}
                    >
                      <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: 700, lineHeight: '1' }}>
                        {isFeatured ? `⭐ ${selectionOrder}` : selectionOrder}
                      </span>
                    </div>
                  )}

                  {/* Instagram type badge */}
                  {isInstagram && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        backgroundColor: '#8b5cf6',
                        color: '#ffffff',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        zIndex: 10,
                      }}
                    >
                      IG
                    </div>
                  )}

                  {/* Selected badge */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        backgroundColor: isInstagram ? '#8b5cf6' : '#3b82f6',
                        color: '#ffffff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        zIndex: 10,
                      }}
                    >
                      ✓ SELECTED
                    </div>
                  )}

                  {/* Image */}
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.type === 'image' ? item.data.altText : item.data.post?.title || `${item.type} ${item.index + 1}`}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '120px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        color: '#6b7280',
                        textAlign: 'center',
                        padding: '8px',
                      }}
                    >
                      No preview available
                    </div>
                  )}

                  {/* Label */}
                  <div
                    style={{
                      fontSize: '12px',
                      textAlign: 'center',
                      marginTop: '6px',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? (isInstagram ? '#6b21a8' : isFeatured ? '#92400e' : '#1e40af') : '#4b5563',
                    }}
                  >
                    {isSelected && !isInstagram
                      ? (isFeatured ? '⭐ Featured (#1)' : `Selected #${selectionOrder}`)
                      : (displayIndex === 0 ? 'First in Gallery' : isInstagram ? `Instagram ${item.index + 1}` : `Gallery ${item.index + 1}`)
                    }
                  </div>

                  {/* Alt text or title if available */}
                  {item.type === 'image' && item.data.altText && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        marginTop: '4px',
                        lineHeight: '1.3',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.data.altText}
                    >
                      {item.data.altText}
                    </div>
                  )}
                  {item.type === 'instagram' && item.data.post?.title && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        marginTop: '4px',
                        lineHeight: '1.3',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.data.post.title}
                    >
                      {item.data.post.title}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default GalleryImagePicker
