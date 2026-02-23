'use client'

/**
 * Place Details Field Component
 *
 * A custom Payload CMS field component that shows type selectors based on selected categories.
 * When a category (Dining, Accommodations, etc.) is selected, the corresponding type dropdown appears.
 */

import React, { useEffect, useState, useMemo } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'
import {
  diningTypeOptions,
  accommodationTypeOptions,
  nightlifeTypeOptions,
  attractionTypeOptions,
} from '../collections/details'

type Props = {
  path: string
}

// Category slug to detail field mapping
const CATEGORY_CONFIG: Record<
  string,
  {
    label: string
    fieldName: string
    options: { label: string; value: string }[]
    detailCollection: string
  }
> = {
  dining: {
    label: 'Dining Type',
    fieldName: 'diningType',
    options: diningTypeOptions,
    detailCollection: 'dining-details',
  },
  accommodations: {
    label: 'Accommodation Type',
    fieldName: 'accommodationType',
    options: accommodationTypeOptions,
    detailCollection: 'accommodation-details',
  },
  nightlife: {
    label: 'Nightlife Type',
    fieldName: 'nightlifeType',
    options: nightlifeTypeOptions,
    detailCollection: 'nightlife-details',
  },
  attractions: {
    label: 'Attraction Type',
    fieldName: 'attractionType',
    options: attractionTypeOptions,
    detailCollection: 'attraction-details',
  },
}

const PlaceDetailsField: React.FC<Props> = () => {
  const { id } = useDocumentInfo()

  // Watch the categories field - this updates when user selects categories
  const { value: categoriesValue } = useField<any[] | null>({ path: 'categories' })

  // Debug logging
  console.log('[PlaceDetailsField] categoriesValue:', categoriesValue)

  // Virtual fields to store type selections
  const { value: diningType, setValue: setDiningType } = useField<string>({ path: 'diningType' })
  const { value: accommodationType, setValue: setAccommodationType } = useField<string>({
    path: 'accommodationType',
  })
  const { value: nightlifeType, setValue: setNightlifeType } = useField<string>({
    path: 'nightlifeType',
  })
  const { value: attractionType, setValue: setAttractionType } = useField<string>({
    path: 'attractionType',
  })

  const [categoryData, setCategoryData] = useState<Record<string, any>>({})
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Get category IDs from the relationship value
  const categoryIds = useMemo(() => {
    if (!categoriesValue || !Array.isArray(categoriesValue)) return []
    return categoriesValue.map((cat: any) => (typeof cat === 'object' ? cat.id : cat)).filter(Boolean)
  }, [categoriesValue])

  console.log('[PlaceDetailsField] categoryIds:', categoryIds)

  // Fetch category details to get their slugs
  useEffect(() => {
    if (categoryIds.length === 0) {
      setCategoryData({})
      return
    }

    const fetchCategories = async () => {
      const url = `/api/place-categories?where[id][in]=${categoryIds.join(',')}&depth=0`
      console.log('[PlaceDetailsField] Fetching categories from:', url)
      try {
        const response = await fetch(url)
        console.log('[PlaceDetailsField] Response status:', response.status)
        if (response.ok) {
          const data = await response.json()
          console.log('[PlaceDetailsField] Category data:', data)
          const categoryMap: Record<string, any> = {}
          data.docs.forEach((cat: any) => {
            categoryMap[cat.slug] = cat
          })
          console.log('[PlaceDetailsField] Category map:', categoryMap)
          setCategoryData(categoryMap)
        }
      } catch (error) {
        console.error('[PlaceDetailsField] Error fetching categories:', error)
      }
    }

    fetchCategories()
  }, [categoryIds])

  // Fetch existing detail records when editing
  useEffect(() => {
    if (!id) return

    const fetchDetails = async () => {
      setLoadingDetails(true)
      try {
        // Fetch all detail records for this place in parallel
        const detailCollections = ['dining-details', 'accommodation-details', 'nightlife-details', 'attraction-details']
        const responses = await Promise.all(
          detailCollections.map((collection) =>
            fetch(`/api/${collection}?where[place][equals]=${id}&depth=0`).then((r) => r.json())
          )
        )

        // Set the type values from existing records
        const [dining, accommodation, nightlife, attraction] = responses

        if (dining?.docs?.[0]?.type) setDiningType(dining.docs[0].type)
        if (accommodation?.docs?.[0]?.type) setAccommodationType(accommodation.docs[0].type)
        if (nightlife?.docs?.[0]?.type) setNightlifeType(nightlife.docs[0].type)
        if (attraction?.docs?.[0]?.type) setAttractionType(attraction.docs[0].type)
      } catch (error) {
        console.error('Error fetching detail records:', error)
      }
      setLoadingDetails(false)
    }

    fetchDetails()
  }, [id, setDiningType, setAccommodationType, setNightlifeType, setAttractionType])

  // Get active categories (those that are selected)
  const activeCategories = useMemo(() => {
    return Object.keys(CATEGORY_CONFIG).filter((slug) => categoryData[slug])
  }, [categoryData])

  // Map field names to setters
  const setters: Record<string, (value: string) => void> = {
    diningType: setDiningType,
    accommodationType: setAccommodationType,
    nightlifeType: setNightlifeType,
    attractionType: setAttractionType,
  }

  // Map field names to current values
  const values: Record<string, string | undefined> = {
    diningType,
    accommodationType,
    nightlifeType,
    attractionType,
  }

  if (activeCategories.length === 0) {
    return (
      <div className="field-type" style={{ marginTop: '20px' }}>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: '14px', fontStyle: 'italic' }}>
          {categoryIds.length === 0
            ? 'Select categories above to configure type details'
            : 'Loading category details...'}
        </p>
      </div>
    )
  }

  if (loadingDetails) {
    return (
      <div className="field-type" style={{ marginTop: '20px' }}>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: '14px' }}>Loading details...</p>
      </div>
    )
  }

  return (
    <div className="field-type" style={{ marginTop: '20px' }}>
      <h4
        style={{
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--theme-elevation-800)',
        }}
      >
        Category Details
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activeCategories.map((slug) => {
          const config = CATEGORY_CONFIG[slug]
          const currentValue = values[config.fieldName] || ''
          const setValue = setters[config.fieldName]

          return (
            <div key={slug} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--theme-elevation-700)',
                }}
              >
                {config.label}
              </label>
              <select
                value={currentValue}
                onChange={(e) => setValue(e.target.value)}
                style={{
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--theme-input-bg)',
                  color: 'var(--theme-elevation-800)',
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: '300px',
                }}
              >
                <option value="">Select type...</option>
                {config.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PlaceDetailsField
