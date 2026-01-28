/**
 * Relationship Field With Preview Component
 *
 * Wrapper component that renders Payload's native RelationshipField
 * and displays an ItemPreview below it when an item is selected.
 *
 * How it works:
 * 1. Renders standard Payload relationship dropdown (unchanged)
 * 2. Uses useFormFields to read the selected item ID from form state
 * 3. Fetches full item data via API when ID is detected
 * 4. Displays ItemPreview below dropdown with fetched data
 *
 * Used by collection-specific wrappers (DiningItemField, etc.)
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useFormFields } from '@payloadcms/ui'
import { RelationshipField } from '@payloadcms/ui'
import { ItemPreview } from './ItemPreview'
import { formatLocationForDisplay } from '../../../../../shared/location/utils'

type RelationshipFieldWithPreviewProps = {
  path: string
  field: any
  collectionLabel: string // "Dining", "Accommodation", "Attraction", "Nightlife"
}

const RelationshipFieldWithPreview: React.FC<RelationshipFieldWithPreviewProps> = (props) => {
  const { path, field, collectionLabel, ...restProps } = props

  // State for fetched item data and loading
  const [fetchedItem, setFetchedItem] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Read the selected item ID from form state
  const itemId = useFormFields(([fields]) => {
    const fieldValue = fields[path]?.value

    console.log('[RelationshipFieldWithPreview] Field value:', fieldValue)

    // Value could be: number (ID), string (ID), or object (populated)
    if (typeof fieldValue === 'object' && fieldValue && 'id' in fieldValue) {
      return (fieldValue as { id: string | number }).id
    }
    if (typeof fieldValue === 'number' || typeof fieldValue === 'string') {
      return fieldValue
    }
    return null
  })

  // Read the selected gallery indices from sibling field
  const selectedGalleryIndices = useFormFields(([fields]) => {
    // Convert path from "items.0.item" to "items.0.selectedGalleryIndices"
    const pathParts = path.split('.')
    const indicesPath = pathParts.slice(0, -1).concat('selectedGalleryIndices').join('.')

    const indicesValue = fields[indicesPath]?.value

    console.log('[RelationshipFieldWithPreview] selectedGalleryIndices path:', indicesPath)
    console.log('[RelationshipFieldWithPreview] selectedGalleryIndices value:', indicesValue)

    // Return array, default to empty array if not set
    return Array.isArray(indicesValue) ? indicesValue : []
  })

  // Read the selected Instagram index from sibling field
  const selectedInstagramIndex = useFormFields(([fields]) => {
    // Convert path from "items.0.item" to "items.0.selectedInstagramIndex"
    const pathParts = path.split('.')
    const indexPath = pathParts.slice(0, -1).concat('selectedInstagramIndex').join('.')

    const indexValue = fields[indexPath]?.value

    console.log('[RelationshipFieldWithPreview] selectedInstagramIndex path:', indexPath)
    console.log('[RelationshipFieldWithPreview] selectedInstagramIndex value:', indexValue)

    // Return the index value or null if not set
    return typeof indexValue === 'number' ? indexValue : null
  })

  // Fetch item data when ID changes
  useEffect(() => {
    if (!itemId) {
      setFetchedItem(null)
      return
    }

    const collection = field.relationTo // 'dining', 'accommodations', 'attractions', 'nightlife'

    console.log('[RelationshipFieldWithPreview] Fetching item:', itemId, 'from collection:', collection)

    setLoading(true)
    fetch(`/api/${collection}/${itemId}?depth=2`)
      .then(res => res.json())
      .then(data => {
        console.log('[RelationshipFieldWithPreview] Fetched data:', data)
        setFetchedItem({
          ...data,
          location: formatLocationForDisplay(data.location),
        })
        setLoading(false)
      })
      .catch(err => {
        console.error('[RelationshipFieldWithPreview] Fetch error:', err)
        setLoading(false)
      })
  }, [itemId, field.relationTo])

  // Render native RelationshipField
  const relationshipField = <RelationshipField {...restProps} path={path} field={field} />

  // Show loading state
  if (loading) {
    return (
      <div>
        {relationshipField}
        <div style={{ marginTop: '12px', padding: '16px', textAlign: 'center', color: '#666' }}>
          Loading preview...
        </div>
      </div>
    )
  }

  // Show preview if we have fetched data
  if (fetchedItem) {
    console.log('[RelationshipFieldWithPreview] Showing preview for:', fetchedItem.title)
    console.log('[RelationshipFieldWithPreview] Using gallery indices:', selectedGalleryIndices)
    console.log('[RelationshipFieldWithPreview] Using Instagram index:', selectedInstagramIndex)
    return (
      <div>
        {relationshipField}
        <ItemPreview
          item={fetchedItem}
          collectionLabel={collectionLabel}
          selectedGalleryIndices={selectedGalleryIndices}
          selectedInstagramIndex={selectedInstagramIndex}
        />
      </div>
    )
  }

  // No item selected or failed to fetch
  return relationshipField
}

export default RelationshipFieldWithPreview
