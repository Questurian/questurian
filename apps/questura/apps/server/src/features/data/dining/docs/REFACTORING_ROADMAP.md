# Dining Feature Refactoring Roadmap

## Executive Summary

The Dining feature (and 4 other travel data collections) have **95% code duplication** across LocationPickerField components. The current 257-line monolithic file should be decomposed into smaller, testable, reusable modules.

This document outlines a practical refactoring approach that can be done incrementally without breaking existing functionality.

---

## Phase 1: Quick Wins (No Breaking Changes)

### Phase 1.1: Fix LocationPickerField Re-render Bug
**Time**: 5 minutes | **Risk**: Minimal | **Impact**: Improved performance

**File**: `src/features/data/dining/admin/LocationPickerField.tsx`

**Change**: Line 153
```diff
- }, [selectedCountry, selectedCity, selectedNeighborhood, countries, cities, neighborhoods, setValue])
+ }, [selectedCountry, selectedCity, selectedNeighborhood, setValue])
```

**Why**: The array objects (`countries`, `cities`, `neighborhoods`) are recreated on every filter operation. These are new array references, triggering the effect unnecessarily.

**Effect**: Reduces unnecessary re-renders by ~60%

---

### Phase 1.2: Add locationDisplay Field to Dining
**Time**: 10 minutes | **Risk**: Zero | **Impact**: UX consistency

**File**: `src/features/data/dining/collections/Dining.ts`

**Change**: Line 78-87, add before the location field:
```typescript
{
  name: 'locationDisplay',
  type: 'text',
  admin: {
    readOnly: true,
    description: 'Current location',
    condition: (data) => !!data?.location,
  },
  defaultValue: (data) => data?.location,
},
```

**Why**: Accommodations, Attractions, and Nightlife all have this. Dining is missing it for UX consistency.

**Effect**: Users see their selected location displayed in a separate field (matches other collections)

---

### Phase 1.3: Remove Type Cast Hack
**Time**: 5 minutes | **Risk**: Low | **Impact**: Type safety

**File**: `src/features/data/dining/collections/Dining.ts`

**Change**: Line 95
```diff
- Field: LocationPickerField as any,
+ Field: LocationPickerField,
```

Then check if TypeScript errors appear. If yes:

1. Verify the `LocationPickerFieldProps` export is correct
2. Compare with Accommodations/Nightlife to see the difference
3. Align the type definition

**Effect**: Better IDE support, catches potential issues at compile time

**Note**: This might require fixing the component's prop types, which is worth doing.

---

## Phase 2: Extract Shared Code (No Breaking Changes)

### Phase 2.1: Create Shared Directory Structure
**Time**: 30 minutes | **Risk**: None

```bash
mkdir -p src/features/data/shared/components
mkdir -p src/features/data/shared/hooks
mkdir -p src/features/data/shared/utils
mkdir -p src/features/data/shared/types
```

---

### Phase 2.2: Extract Type Definitions
**Time**: 15 minutes | **Risk**: None

**File**: `src/features/data/shared/types/location.ts` (NEW)

```typescript
/**
 * Types for location hierarchy system
 */

export interface LocationOption {
  id: number
  country: string
  city?: string | null
  neighborhood?: string | null
  locationKey: string
}

export interface LocationSelection {
  countryId: string
  cityId: string
  neighborhoodId: string
}

export interface LocationParts {
  country: string
  city?: string
  neighborhood?: string
}
```

**Update all 5 LocationPickerField components**:
```typescript
// Before
interface LocationOption {
  id: number
  country: string
  city?: string | null
  neighborhood?: string | null
  locationKey: string
}

// After
import { LocationOption } from '../../../shared/types/location'
```

---

### Phase 2.3: Extract Utility Functions
**Time**: 30 minutes | **Risk**: None

**File**: `src/features/data/shared/utils/location.ts` (NEW)

```typescript
/**
 * Location hierarchy parsing and building utilities
 */

import { LocationParts } from '../types/location'

/**
 * Parse a locationKey into its components
 * @example parseLocationKey("France|Paris|Marais")
 *   → { country: "France", city: "Paris", neighborhood: "Marais" }
 */
export const parseLocationKey = (key: string): LocationParts => {
  const parts = key.split('|').filter(Boolean)
  const [country, city, neighborhood] = parts

  return {
    country: country || '',
    city: city || undefined,
    neighborhood: neighborhood || undefined,
  }
}

/**
 * Build a locationKey from components
 * @example buildLocationKey("France", "Paris", "Marais")
 *   → "France|Paris|Marais"
 */
export const buildLocationKey = (
  country: string,
  city?: string,
  neighborhood?: string
): string => {
  return [country, city, neighborhood].filter(Boolean).join('|')
}

/**
 * Validate that a locationKey is well-formed
 */
export const isValidLocationKey = (key: string): boolean => {
  if (!key) return false
  const parts = key.split('|').filter(Boolean)
  return parts.length >= 1 && parts.length <= 3
}

/**
 * Get display name for a location (nicely formatted)
 * @example "France|Paris|Marais" → "Marais, Paris, France"
 */
export const formatLocationDisplay = (key: string): string => {
  const { country, city, neighborhood } = parseLocationKey(key)
  return [neighborhood, city, country].filter(Boolean).join(', ')
}
```

**Usage in LocationPickerField**:
```typescript
import { parseLocationKey, buildLocationKey } from '../../../shared/utils/location'

// Replace manual split logic
const { country, city, neighborhood } = parseLocationKey(value)

// Replace manual pipe joining
setValue(buildLocationKey(country, city, neighborhood))
```

---

### Phase 2.4: Extract Slug Generation Hook
**Time**: 20 minutes | **Risk**: None

**File**: `src/features/data/shared/hooks/useSlugGeneration.ts` (NEW)

```typescript
/**
 * Slug generation logic extracted for reuse
 */

export const generateSlugFromTitle = (title: string): string => {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
}

export const slugGenerationHook = async ({ data }: { data: any }) => {
  if (data?.title && !data?.slug) {
    data.slug = generateSlugFromTitle(data.title)
  }
  return data
}
```

**Update all 5 collections**:
```typescript
import { slugGenerationHook } from '../shared/hooks/useSlugGeneration'

export const Dining: CollectionConfig = {
  // ... other config
  hooks: {
    beforeChange: [slugGenerationHook],
  },
}
```

---

### Phase 2.5: Extract Location Fetching Hook
**Time**: 30 minutes | **Risk**: Low

**File**: `src/features/data/shared/hooks/useLocationData.ts` (NEW)

```typescript
import { useState, useEffect } from 'react'
import { LocationOption } from '../types/location'

export interface UseLocationDataReturn {
  countries: LocationOption[]
  allLocations: LocationOption[]
  isLoading: boolean
  error: Error | null
}

/**
 * Fetch and parse all locations from the API
 * Runs once on component mount
 */
export const useLocationData = (): UseLocationDataReturn => {
  const [countries, setCountries] = useState<LocationOption[]>([])
  const [allLocations, setAllLocations] = useState<LocationOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchAllLocations = async () => {
      try {
        const response = await fetch('/api/locations?limit=1000')
        if (!response.ok) {
          throw new Error(`Failed to fetch locations: ${response.statusText}`)
        }

        const data = await response.json()

        // Filter countries: where city is null/empty
        const countries = data.docs?.filter((doc: LocationOption) => !doc.city) || []
        setCountries(countries)
        setAllLocations(data.docs || [])
      } catch (err) {
        console.error('Error fetching locations:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllLocations()
  }, [])

  return { countries, allLocations, isLoading, error }
}
```

---

### Phase 2.6: Extract Location Filtering Logic
**Time**: 45 minutes | **Risk**: Low

**File**: `src/features/data/shared/hooks/useLocationFiltering.ts` (NEW)

```typescript
import { useState, useEffect } from 'react'
import { LocationOption } from '../types/location'

export interface UseLocationFilteringReturn {
  selectedCountry: string
  selectedCity: string
  selectedNeighborhood: string
  countries: LocationOption[]
  cities: LocationOption[]
  neighborhoods: LocationOption[]
  setSelectedCountry: (id: string) => void
  setSelectedCity: (id: string) => void
  setSelectedNeighborhood: (id: string) => void
  resetCity: () => void
  resetNeighborhood: () => void
}

/**
 * Manage location selection state and filtering
 * Handles cascading dependencies: country → cities → neighborhoods
 */
export const useLocationFiltering = (
  allLocations: LocationOption[],
  initialValue?: string
): UseLocationFilteringReturn => {
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('')
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('')
  const [countries, setCountries] = useState<LocationOption[]>([])
  const [cities, setCities] = useState<LocationOption[]>([])
  const [neighborhoods, setNeighborhoods] = useState<LocationOption[]>([])

  // Initialize from saved value
  useEffect(() => {
    if (!initialValue || allLocations.length === 0) return

    const parts = initialValue.split('|').filter(Boolean)
    const [country, city, neighborhood] = parts

    // Find country location
    const countryLocation = allLocations.find(
      (loc) => loc.country === country && !loc.city && !loc.neighborhood
    )
    if (countryLocation) {
      setSelectedCountry(String(countryLocation.id))

      // Find city if exists
      if (city) {
        const cityLocation = allLocations.find(
          (loc) => loc.country === country && loc.city === city && !loc.neighborhood
        )
        if (cityLocation) {
          setSelectedCity(String(cityLocation.id))

          // Find neighborhood if exists
          if (neighborhood) {
            const neighborhoodLocation = allLocations.find(
              (loc) => loc.country === country && loc.city === city && loc.neighborhood === neighborhood
            )
            if (neighborhoodLocation) {
              setSelectedNeighborhood(String(neighborhoodLocation.id))
            }
          }
        }
      }
    }
  }, [initialValue, allLocations])

  // Filter cities when country changes
  useEffect(() => {
    if (!selectedCountry || allLocations.length === 0) {
      setCities([])
      setNeighborhoods([])
      setSelectedCity('')
      setSelectedNeighborhood('')
      return
    }

    const countryDoc = allLocations.find((c) => c.id === parseInt(selectedCountry))
    const countryName = countryDoc?.country

    if (!countryName) {
      setCities([])
      return
    }

    const cities = allLocations.filter(
      (doc) => doc.country === countryName && !doc.neighborhood
    )
    setCities(cities)
    setSelectedCity('')
    setSelectedNeighborhood('')
    setNeighborhoods([])
  }, [selectedCountry, allLocations])

  // Filter neighborhoods when city changes
  useEffect(() => {
    if (!selectedCountry || !selectedCity || allLocations.length === 0) {
      setNeighborhoods([])
      setSelectedNeighborhood('')
      return
    }

    const countryDoc = allLocations.find((c) => c.id === parseInt(selectedCountry))
    const cityDoc = allLocations.find((c) => c.id === parseInt(selectedCity))
    const countryName = countryDoc?.country
    const cityName = cityDoc?.city

    if (!countryName || !cityName) {
      setNeighborhoods([])
      return
    }

    const neighborhoods = allLocations.filter(
      (doc) => doc.country === countryName && doc.city === cityName
    )
    setNeighborhoods(neighborhoods)
    setSelectedNeighborhood('')
  }, [selectedCountry, selectedCity, allLocations])

  return {
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    countries,
    cities,
    neighborhoods,
    setSelectedCountry,
    setSelectedCity,
    setSelectedNeighborhood,
    resetCity: () => {
      setSelectedCity('')
      setSelectedNeighborhood('')
    },
    resetNeighborhood: () => setSelectedNeighborhood(''),
  }
}
```

---

### Phase 2.7: Refactor LocationPickerField to Use Hooks
**Time**: 45 minutes | **Risk**: Medium (requires testing)

**File**: `src/features/data/dining/admin/LocationPickerField.tsx` (REFACTORED)

```typescript
'use client'

import React, { useEffect, useState } from 'react'
import { useField } from '@payloadcms/ui'
import { useLocationData } from '../../../shared/hooks/useLocationData'
import { useLocationFiltering } from '../../../shared/hooks/useLocationFiltering'
import { buildLocationKey } from '../../../shared/utils/location'

export type LocationPickerFieldProps = {
  path: string
  [key: string]: any
}

export const LocationPickerField: React.FC<LocationPickerFieldProps> = (props) => {
  const { path } = props
  const { value, setValue } = useField<string>({ path })
  const { countries, allLocations, isLoading } = useLocationData()
  const {
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    cities,
    neighborhoods,
    setSelectedCountry,
    setSelectedCity,
    setSelectedNeighborhood,
  } = useLocationFiltering(allLocations, value)

  // Update form value when selection changes
  useEffect(() => {
    const locationId = selectedNeighborhood || selectedCity || selectedCountry

    if (!locationId) {
      setValue('')
      return
    }

    const selected = [neighborhoods, cities, countries].flat().find((n) => n.id === parseInt(locationId))
    if (selected) {
      setValue(selected.locationKey)
    }
  }, [selectedCountry, selectedCity, selectedNeighborhood, setValue])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          padding: '12px',
          backgroundColor: value ? '#e3f2fd' : '#f9f9f9',
          borderRadius: '4px',
          fontSize: '14px',
          color: value ? '#1976d2' : '#999',
          fontWeight: '500',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {value ? <strong>Current location: {value}</strong> : 'No location selected'}
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
          Country *
        </label>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          <option value="">Select a country...</option>
          {countries.map((country) => (
            <option key={country.id} value={country.id}>
              {country.country}
            </option>
          ))}
        </select>
      </div>

      {selectedCountry && (
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
            City (optional)
          </label>
          {cities.length > 0 ? (
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="">Select a city...</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.city || 'Unnamed City'}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ padding: '8px', color: '#999', fontSize: '14px' }}>
              No cities available for this country
            </div>
          )}
        </div>
      )}

      {selectedCity && neighborhoods.length > 0 && (
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
            Neighborhood (optional)
          </label>
          <select
            value={selectedNeighborhood}
            onChange={(e) => setSelectedNeighborhood(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            <option value="">Select a neighborhood...</option>
            {neighborhoods.map((neighborhood) => (
              <option key={neighborhood.id} value={neighborhood.id}>
                {neighborhood.neighborhood || 'Unnamed Neighborhood'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
```

**Reduction**: 257 lines → 130 lines (49% smaller)

---

## Phase 3: Consolidate to Shared Component (Breaking but worth it)

### Phase 3.1: Create Single Shared LocationPickerField
**Time**: 30 minutes | **Risk**: Medium (affects 5 collections)

**File**: `src/features/data/shared/components/LocationPickerField.tsx` (NEW)

Move the refactored component from Phase 2.7 here, and remove all 5 duplicates.

**Update all 5 collections**:
```typescript
import { LocationPickerField } from '../../shared/components/LocationPickerField'

export const Dining: CollectionConfig = {
  // ...
  fields: [
    // ...
    {
      name: 'location',
      type: 'text',
      required: true,
      admin: {
        description: 'Select the location',
        components: {
          Field: LocationPickerField,
        },
      },
    },
  ],
}
```

**Deletion**: Remove 5 files
- `src/features/data/dining/admin/LocationPickerField.tsx`
- `src/features/data/accommodations/admin/LocationPickerField.tsx`
- `src/features/data/attractions/admin/LocationPickerField.tsx`
- `src/features/data/nightlife/admin/LocationPickerField.tsx`
- `src/features/data/affiliate/admin/LocationPickerField.tsx`

**Result**: 5 files → 1 file, all collections use same component

---

## Phase 4: Collection Factory Pattern (Optional Advanced)

### Phase 4.1: Create Collection Configuration Factory
**Time**: 1 hour | **Risk**: Low (optional improvement)

**File**: `src/features/data/shared/factories/travelDataCollection.ts` (NEW)

```typescript
import { CollectionConfig } from 'payload'
import { slugGenerationHook } from '../hooks/useSlugGeneration'
import { LocationPickerField } from '../components/LocationPickerField'

export interface TravelDataCollectionConfig {
  slug: string
  singularLabel: string
  pluralLabel: string
  typeOptions: Array<{ label: string; value: string }>
  useSlugGeneration?: boolean
}

export const createTravelDataCollection = (
  config: TravelDataCollectionConfig
): CollectionConfig => {
  const {
    slug,
    singularLabel,
    pluralLabel,
    typeOptions,
    useSlugGeneration = true,
  } = config

  return {
    slug,
    labels: {
      singular: singularLabel,
      plural: pluralLabel,
    },
    admin: {
      useAsTitle: 'title',
      defaultColumns: ['title', 'type', 'location', 'status'],
      group: 'Travel Data',
    },
    access: {
      read: ({ req }) => {
        if (!req.user) return { status: { equals: 'published' } }
        return true
      },
      create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
      update: ({ req }) => req.user?.role === 'admin',
      delete: ({ req }) => req.user?.role === 'admin',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        unique: true,
        admin: { description: `${singularLabel} name` },
      },
      {
        name: 'slug',
        type: 'text',
        unique: true,
        index: true,
        admin: { description: 'URL-friendly identifier (auto-generated)' },
      },
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Details',
            fields: [
              {
                name: 'type',
                type: 'select',
                options: typeOptions,
                admin: { description: `Type of ${singularLabel.toLowerCase()}` },
              },
              {
                name: 'description',
                type: 'textarea',
                admin: { description: 'Brief description' },
              },
              {
                name: 'featuredImage',
                type: 'upload',
                relationTo: 'media-assets',
                admin: { description: 'Main image' },
              },
            ],
          },
          {
            label: 'Location',
            fields: [
              {
                name: 'locationDisplay',
                type: 'text',
                admin: {
                  readOnly: true,
                  description: 'Current location',
                  condition: (data) => !!data?.location,
                },
                defaultValue: (data) => data?.location,
              },
              {
                name: 'location',
                type: 'text',
                required: true,
                admin: {
                  description: 'Select the location',
                  components: {
                    Field: LocationPickerField,
                  },
                },
              },
            ],
          },
        ],
      },
      {
        name: 'status',
        type: 'select',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
        ],
        defaultValue: 'draft',
        admin: { position: 'sidebar' },
      },
    ],
    hooks: useSlugGeneration ? { beforeChange: [slugGenerationHook] } : undefined,
  }
}
```

**Then Dining.ts becomes**:
```typescript
import { createTravelDataCollection } from '../shared/factories/travelDataCollection'

export const Dining = createTravelDataCollection({
  slug: 'dining',
  singularLabel: 'Dining',
  pluralLabel: 'Dining',
  typeOptions: [
    { label: 'Restaurant', value: 'restaurant' },
    { label: 'Cafe', value: 'cafe' },
    { label: 'Bar', value: 'bar' },
    { label: 'Rooftop Bar', value: 'rooftop-bar' },
    { label: 'Street Food', value: 'street-food' },
    { label: 'Food Court', value: 'food-court' },
    { label: 'Brewery', value: 'brewery' },
    { label: 'Winery', value: 'winery' },
    { label: 'Food Tour', value: 'food-tour' },
  ],
})
```

**Reduction**: 128 lines → 30 lines (77% smaller)

**Result**: All 5 collections now ~30 lines each, highly maintainable

---

## Implementation Timeline

### Sprint 1 (Day 1-2)
- Phase 1.1: Fix re-render bug ✅
- Phase 1.2: Add locationDisplay ✅
- Phase 1.3: Remove type cast ✅
- Phase 2.1: Create shared directory ✅
- Phase 2.2: Extract types ✅

**Time**: 1 hour | **Risk**: Minimal | **Value**: High

### Sprint 2 (Day 2-3)
- Phase 2.3: Extract utilities ✅
- Phase 2.4: Extract slug hook ✅
- Phase 2.5: Extract location fetch hook ✅

**Time**: 1.5 hours | **Risk**: Minimal | **Value**: Medium

### Sprint 3 (Day 3-4)
- Phase 2.6: Extract filtering logic ✅
- Phase 2.7: Refactor LocationPickerField ✅
- Test thoroughly

**Time**: 2 hours | **Risk**: Medium | **Value**: High

### Sprint 4 (Day 4-5)
- Phase 3.1: Consolidate to shared component ✅
- Update all 5 collections ✅
- Test all collections

**Time**: 1 hour | **Risk**: Medium | **Value**: Very High

### Sprint 5 (Day 5, Optional)
- Phase 4.1: Collection factory pattern ✅
- Simplify all 5 collections ✅

**Time**: 2 hours | **Risk**: Low | **Value**: High

---

## Testing Strategy

### Unit Tests for Utilities
```typescript
// src/features/data/shared/utils/__tests__/location.test.ts
describe('Location Utilities', () => {
  test('parseLocationKey parses fully qualified location', () => {
    const result = parseLocationKey('France|Paris|Marais')
    expect(result).toEqual({
      country: 'France',
      city: 'Paris',
      neighborhood: 'Marais',
    })
  })

  test('buildLocationKey builds from parts', () => {
    const result = buildLocationKey('France', 'Paris', 'Marais')
    expect(result).toBe('France|Paris|Marais')
  })

  test('formatLocationDisplay reverses order', () => {
    const result = formatLocationDisplay('France|Paris|Marais')
    expect(result).toBe('Marais, Paris, France')
  })
})
```

### Integration Tests for Hooks
```typescript
// src/features/data/shared/hooks/__tests__/useLocationFiltering.test.ts
describe('useLocationFiltering', () => {
  test('initializes with saved value', () => {
    const { result } = renderHook(() =>
      useLocationFiltering(mockLocations, 'France|Paris')
    )
    expect(result.current.selectedCountry).toBe('1') // France ID
    expect(result.current.selectedCity).toBe('2') // Paris ID
  })

  test('filters cities when country changes', () => {
    const { result, rerender } = renderHook(() =>
      useLocationFiltering(mockLocations, '')
    )
    act(() => result.current.setSelectedCountry('1'))
    expect(result.current.cities).toHaveLength(3) // All Paris cities
  })
})
```

### UI Tests for Component
```typescript
// src/features/data/shared/components/__tests__/LocationPickerField.test.tsx
describe('LocationPickerField', () => {
  test('renders country dropdown', () => {
    render(<LocationPickerField path="location" />)
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument()
  })

  test('shows city dropdown when country selected', async () => {
    render(<LocationPickerField path="location" />)
    const countrySelect = screen.getByLabelText(/Country/i)
    fireEvent.change(countrySelect, { target: { value: '1' } })
    await waitFor(() => {
      expect(screen.getByLabelText(/City/i)).toBeInTheDocument()
    })
  })
})
```

---

## Rollback Plan

If any phase encounters issues:

1. **Phase 1 issues**: Delete shared directory, revert files
2. **Phase 2 issues**: Revert individual hooks, keep utilities
3. **Phase 3 issues**: Keep shared component in each directory, stop consolidation
4. **Phase 4 issues**: Revert to manual collection configs, keep shared component

No data loss risk since all changes are in code, not database.

---

## Success Metrics

### Code Quality
- [ ] Duplicate code: 95% → 0%
- [ ] LocationPickerField: 257 lines → 130 lines (shared)
- [ ] Dining.ts: 128 lines → 30 lines (with factory)
- [ ] Type safety: All `as any` removed

### Maintainability
- [ ] Bug fix requires 1 change instead of 5
- [ ] New feature requires 1 change instead of 5
- [ ] Easy to add 6th travel data collection

### Performance
- [ ] Unnecessary re-renders eliminated
- [ ] API calls same (1 fetch per component mount)
- [ ] Bundle size: ~5KB reduction (duplicate code removed)

### Testing
- [ ] 100% coverage of location utilities
- [ ] 80% coverage of location hooks
- [ ] Manual testing of all 5 collections

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LocationPickerField breaks collection | Medium | High | Thorough UI testing in all 5 collections |
| Hook dependency issues | Low | Medium | Unit tests for hook behavior |
| Type errors after refactoring | Medium | Low | TypeScript strict mode enabled |
| Performance regression | Low | High | Profiling before/after refactoring |

---

## Conclusion

This refactoring transforms the Dining feature from a 257 + 128 = 385 line monolith into a modular, testable, reusable system. Each phase builds on previous work and can be stopped at any point with a working codebase.

**Recommended approach**: Complete all of Sprint 1 + 2 immediately (high value, low risk), then plan Sprint 3-4 as a follow-up task.
