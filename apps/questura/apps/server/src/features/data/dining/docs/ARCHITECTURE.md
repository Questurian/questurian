# Dining Feature Architecture & Data Flow Analysis

## Overview

The Dining collection is a **travel data module** that stores restaurants, cafes, bars, and other dining establishments. It follows the same pattern as Accommodations, Attractions, Nightlife, and Affiliate Products collections.

**Status**: Functional but with code duplication and potential visibility issues.

---

## 1. Data Structure & Database Model

### Location Hierarchy
The Dining collection stores location information using a **hierarchical pipe-delimited format**:

```
location: "France|Paris|Marais"
```

This represents:
- **Country**: France (top level)
- **City**: Paris (second level)
- **Neighborhood**: Marais (third level, optional)

All locations come from the Locations collection (`src/features/location/collections/Locations.ts`), which is managed by admins via the API or admin UI.

### Core Fields

| Field | Type | Required | Details |
|-------|------|----------|---------|
| `title` | text | ✅ Yes | Establishment name, must be unique |
| `slug` | text | ✅ Yes | Auto-generated from title, URL-friendly ID |
| `type` | select | ❌ No | Restaurant, Cafe, Bar, Rooftop Bar, Street Food, etc. |
| `description` | textarea | ❌ No | Brief marketing description |
| `featuredImage` | upload | ❌ No | References media-assets collection |
| `location` | text | ✅ Yes | Location picker field (custom component) |
| `locationDisplay` | text | ❌ No | Read-only display of selected location |
| `status` | select | ✅ Yes | Draft or Published |

---

## 2. Data Flow Diagram

```
User opens Payload Admin
    ↓
Dining collection form loads
    ↓
LocationPickerField component mounts
    ↓
useEffect #1: Fetch all locations
    └→ GET /api/locations?limit=1000
       └→ Store in allLocations state
    ↓
useEffect #2: Parse saved location value
    └→ If editing: Split "France|Paris|Marais" into [country, city, neighborhood]
       └→ Find matching location records by ID
       └→ Update selectedCountry, selectedCity, selectedNeighborhood state
    ↓
useEffect #3: Filter cities based on country
    └→ Watch: selectedCountry changes
       └→ Query allLocations for cities matching country & no neighborhood
       └→ Update cities dropdown
    ↓
useEffect #4: Filter neighborhoods based on city
    └→ Watch: selectedCity changes
       └→ Query allLocations for neighborhoods matching country & city
       └→ Update neighborhoods dropdown
    ↓
useEffect #5: Update form value
    └→ Watch: selectedNeighborhood/selectedCity/selectedCountry
       └→ setValue(locationKey) - stores in form
       └→ Updates Payload field: `location`
    ↓
User saves form
    ↓
beforeChange hook: Auto-generate slug
    └→ title → slug (kebab-case)
    ↓
Document saved to database
```

---

## 3. Access Control & Visibility

### Public Users (No Authentication)
```javascript
read: ({ req }) => {
  if (!req.user) return { status: { equals: 'published' } }
  return true
}
```
**What they see**: Only dining establishments with `status: 'published'`

**What they cannot see**: Draft items

### Editors & Admins
```javascript
create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin'
update: ({ req }) => req.user?.role === 'admin'
delete: ({ req }) => req.user?.role === 'admin'
```

| Action | Editors | Admins |
|--------|---------|--------|
| Read all (published + drafts) | ✅ Yes | ✅ Yes |
| Create new | ✅ Yes | ✅ Yes |
| Edit existing | ❌ No | ✅ Yes |
| Delete | ❌ No | ✅ Yes |

---

## 4. Component Deep Dive: LocationPickerField

**Location**: `src/features/data/dining/admin/LocationPickerField.tsx`

### State Management
```typescript
const [selectedCountry, setSelectedCountry] = useState<string>('')
const [selectedCity, setSelectedCity] = useState<string>('')
const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('')
const [countries, setCountries] = useState<LocationOption[]>([])
const [cities, setCities] = useState<LocationOption[]>([])
const [neighborhoods, setNeighborhoods] = useState<LocationOption[]>([])
const [allLocations, setAllLocations] = useState<LocationOption[]>([])
const [isLoading, setIsLoading] = useState(true)
```

### Five Coordinated useEffect Hooks

#### Effect 1: Fetch All Locations (Run Once)
```typescript
useEffect(() => {
  const fetchAllLocations = async () => {
    const response = await fetch('/api/locations?limit=1000')
    const data = await response.json()

    // Filter countries: where city is null/empty
    const countries = data.docs?.filter((doc) => !doc.city) || []
    setCountries(countries)
    setAllLocations(data.docs || [])
  }
  fetchAllLocations()
}, [])
```
- Runs once on mount
- Fetches all 1000+ locations
- Pre-filters countries (locations where city is empty)
- No dependency array proper management → potential re-runs

#### Effect 2: Parse Saved Value (Runs on Load)
```typescript
useEffect(() => {
  if (!isLoading && value && allLocations.length > 0) {
    const parts = value.split('|').filter(Boolean)
    const [country, city, neighborhood] = parts

    // Find and select matching locations by ID
    ...
  }
}, [isLoading, value, allLocations])
```
- Runs when: loading finishes, value changes, or locations change
- Parses pipe-delimited format
- Looks up location records to populate select boxes

#### Effect 3: Filter Cities (Runs on Country Change)
```typescript
useEffect(() => {
  if (selectedCountry && allLocations.length > 0) {
    const countryDoc = allLocations.find((c) => c.id === parseInt(selectedCountry))
    const countryName = countryDoc?.country

    // Filter: country matches and neighborhood is empty (city-level records)
    const cities = allLocations.filter(
      (doc) => doc.country === countryName && !doc.neighborhood
    )
    setCities(cities)
    setSelectedCity('')      // Reset city
    setSelectedNeighborhood('') // Reset neighborhood
    setNeighborhoods([])
  }
}, [selectedCountry, allLocations])
```
- Resets city and neighborhood when country changes
- Filters to city-level records only

#### Effect 4: Filter Neighborhoods (Runs on City Change)
```typescript
useEffect(() => {
  if (selectedCountry && selectedCity && allLocations.length > 0) {
    const countryName = countryDoc?.country
    const cityName = cityDoc?.city

    // Filter: country and city both match
    const neighborhoods = allLocations.filter(
      (doc) => doc.country === countryName && doc.city === cityName
    )
    setNeighborhoods(neighborhoods)
    setSelectedNeighborhood('')
  }
}, [selectedCountry, selectedCity, allLocations])
```
- Populates neighborhood options
- Resets neighborhood selection

#### Effect 5: Update Form Field (Runs on Selection)
```typescript
useEffect(() => {
  if (selectedNeighborhood) {
    const selected = neighborhoods.find((n) => n.id === parseInt(selectedNeighborhood))
    setValue(selected.locationKey)
  } else if (selectedCity) {
    const selected = cities.find((c) => c.id === parseInt(selectedCity))
    setValue(selected.locationKey)
  } else if (selectedCountry) {
    const selected = countries.find((c) => c.id === parseInt(selectedCountry))
    setValue(selected.locationKey)
  } else {
    setValue('')
  }
}, [selectedCountry, selectedCity, selectedNeighborhood, countries, cities, neighborhoods, setValue])
```
- Priority: Neighborhood > City > Country
- Stores selected location's `locationKey` in the Payload field
- Can cause unnecessary re-renders due to large dependency array

### UI Structure
- Current location display (read-only box at top)
- Country dropdown (always visible)
- City dropdown (shown when country selected)
- Neighborhood dropdown (shown only when city selected AND neighborhoods exist)
- Inline styling (no external CSS)

---

## 5. Identified Bugs & Issues

### 🐛 BUG #1: Unnecessary Re-renders in Effect 5
**Severity**: Medium | **Impact**: Performance

**Problem**:
```typescript
}, [selectedCountry, selectedCity, selectedNeighborhood, countries, cities, neighborhoods, setValue])
```

The dependency array includes `countries`, `cities`, and `neighborhoods` arrays. These objects change on every filter (new array reference), causing the effect to run constantly.

**Impact**:
- Effect 5 runs after Effect 3 (city filter) → reruns Effect 5
- Effect 5 runs after Effect 4 (neighborhood filter) → reruns Effect 5
- Creates cascading re-renders

**Fix**: Remove array dependencies, only depend on selection IDs
```typescript
}, [selectedCountry, selectedCity, selectedNeighborhood, setValue])
```

---

### 🐛 BUG #2: Missing Dependency in Effect 1
**Severity**: Low | **Impact**: Code correctness

**Problem**:
```typescript
useEffect(() => {
  const fetchAllLocations = async () => { ... }
  fetchAllLocations()
}, []) // Empty array is correct here
```

Actually, this is implemented correctly, but the function is defined inside the effect (good practice).

---

### ⚠️ BUG #3: LocationDisplay Field Never Updates
**Severity**: High | **Impact**: UX - confusing feedback

**Problem**: In Accommodations and other collections:
```typescript
{
  name: 'locationDisplay',
  type: 'text',
  admin: {
    readOnly: true,
    description: 'Current location',
    condition: (data) => !!data?.location,
  },
  defaultValue: (data) => data?.location, // ← This only runs on load
}
```

**Why it fails**:
- `defaultValue` is evaluated once when form initializes
- When location changes via the picker, `locationDisplay` does NOT update
- User sees old/empty locationDisplay while form field has new value

**Expected behavior**:
- Should sync with `location` field in real-time

**Current workaround**: The blue status box in LocationPickerField shows current value, but it's not the official field.

**Solution**: Remove `locationDisplay` field entirely, or use a computed field that syncs from the Payload field value.

---

### ⚠️ BUG #4: Dining Collection Missing locationDisplay Field
**Severity**: Medium | **Impact**: UX inconsistency

**Location**: `src/features/data/dining/collections/Dining.ts` (line 88-99)

**Problem**:
```typescript
{
  name: 'location',
  type: 'text',
  required: true,
  admin: {
    description: 'Select the location',
    components: {
      Field: LocationPickerField as any, // ← type cast hack
    },
  },
}
// ❌ No locationDisplay field above!
```

**Difference from Accommodations/Attractions/Nightlife**:
- Those collections have a `locationDisplay` field for visual feedback
- Dining skips it entirely
- Creates inconsistent UX

**Fix**: Add locationDisplay field to Dining collection

---

### ⚠️ BUG #5: Type Cast Hack
**Severity**: Low | **Impact**: Type safety

**Location**: Dining.ts line 95
```typescript
Field: LocationPickerField as any, // ← Hides type errors
```

Accommodations/Nightlife use proper type export:
```typescript
Field: LocationPickerField, // ← No type cast needed
```

This suggests Dining component might have a type mismatch that's being hidden.

---

### 🔴 BUG #6: Code Duplication Across 5 Collections
**Severity**: High | **Impact**: Maintenance nightmare

**Files with identical LocationPickerField**:
1. `src/features/data/dining/admin/LocationPickerField.tsx`
2. `src/features/data/accommodations/admin/LocationPickerField.tsx`
3. `src/features/data/attractions/admin/LocationPickerField.tsx`
4. `src/features/data/nightlife/admin/LocationPickerField.tsx`
5. `src/features/data/affiliate/admin/LocationPickerField.tsx`

**Status**: 95%+ identical code (5 separate copies)

**Why it's a problem**:
- Any bug fix needs to be applied 5 times
- Feature improvements are inconsistent
- Maintenance burden increases exponentially
- Risk of drift between versions

---

### ⚠️ BUG #7: Access Control Inconsistency
**Severity**: Low | **Impact**: Unexpected behavior for Editors

**Dining.ts**:
```javascript
update: ({ req }) => req.user?.role === 'admin',
```

**Accommodations.ts**:
```javascript
update: ({ req }) => {
  return req.user?.role === 'admin'
},
```

Same logic, but **Dining uses ternary shorthand** while Accommodations uses explicit return. This works but creates inconsistent patterns.

More importantly: **Editors can CREATE but not UPDATE their own items** - this is intentional but confusing UX.

---

## 6. Data Visibility Timeline

### Scenario 1: Editor Creates Draft
```
Timeline:
T0: Editor creates dining item, sets status='draft'
T1: Editor saves (beforeChange hook auto-generates slug)
T2: Database stores with status='draft'

Visibility:
- Public users: ❌ Cannot see (filtered: status='published' only)
- Editor: ✅ Can see (role === 'editor' → read=true)
- Admin: ✅ Can see (role === 'admin' → read=true)
```

### Scenario 2: Admin Publishes Draft
```
Timeline:
T0: Admin opens dining item (status='draft')
T1: Admin changes status to 'published'
T2: Admin saves
T3: beforeChange hook runs (slug already exists, not regenerated)
T4: Document saved

Visibility:
- Public users: ✅ NOW visible (status='published')
- Everyone: ✅ Can see
```

### Scenario 3: Editor Cannot Edit Their Own Item
```
Timeline:
T0: Editor creates item
T1: Editor tries to open item → Can READ (access.read=true)
T2: Editor clicks EDIT → ❌ Blocked by access.update (only admins)
T3: Editor sees "You don't have permission to update this document"

This is surprising because:
- They can CREATE items
- They can READ items
- They CANNOT UPDATE items (not even their own)
- Only ADMINS can update

This design choice locks editors out of editing content.
```

---

## 7. Slug Generation Logic

**Location**: `src/features/data/dining/collections/Dining.ts` (line 114-127)

```typescript
hooks: {
  beforeChange: [
    async ({ data }) => {
      if (data?.title && !data?.slug) {
        data.slug = data.title
          .toLowerCase()           // "Restaurant Paris" → "restaurant paris"
          .trim()                  // Remove leading/trailing spaces
          .replace(/\s+/g, '-')    // Replace spaces with hyphens
          .replace(/[^\w-]/g, '')  // Remove special characters
      }
      return data
    },
  ],
}
```

**Behavior**:
- Only generates slug if `title` exists AND `slug` is empty
- Subsequent updates don't regenerate (preserves existing slug)
- Example: "Bob's Restaurant" → "bobs-restaurant"

**Edge case**: If title changes but slug exists, slug is NOT updated. This is correct behavior (preserves URLs).

---

## 8. Recommended Code Organization

The current structure is:
```
dining/
├── collections/
│   ├── Dining.ts (128 lines)
│   └── index.ts
└── admin/
    └── LocationPickerField.tsx (257 lines)
```

**Problems with 257-line single file**:
- Hard to navigate
- Mixing concerns (state, API, filtering, rendering)
- Difficult to test individual pieces

**Proposed structure**:
```
dining/
├── collections/
│   ├── Dining.ts (60 lines - just config, no component imports)
│   ├── fields/
│   │   ├── LocationField.ts (70 lines - configuration export)
│   │   └── DiningTypeField.ts (if needed)
│   └── index.ts
├── admin/
│   ├── LocationPickerField/
│   │   ├── LocationPickerField.tsx (100 lines - UI only)
│   │   ├── useLocationPicker.ts (100 lines - state management)
│   │   ├── types.ts (interface definitions)
│   │   └── index.ts
│   └── styles/ (if not using inline styles)
├── hooks/
│   ├── useLocationFiltering.ts (core filtering logic)
│   └── useLocationSelection.ts (selection management)
├── utils/
│   ├── locationParser.ts (parse "France|Paris|Marais")
│   ├── locationValidator.ts (validate location keys)
│   └── slugGenerator.ts (extracted from beforeChange hook)
└── docs/
    └── ARCHITECTURE.md (this file)
```

---

## 9. Better Code Organization Pattern

### Extract Shared LocationPickerField
Create: `src/features/data/shared/components/LocationPickerField.tsx`

```typescript
// All 5 collections import from one place
// Any bug fix applies to all collections
// Consistent behavior guaranteed
```

### Extract Type Definitions
Create: `src/features/data/shared/types/location.ts`

```typescript
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
```

### Extract Location Parsing Logic
Create: `src/features/data/shared/utils/parseLocation.ts`

```typescript
export const parseLocationKey = (key: string): {
  country: string
  city?: string
  neighborhood?: string
} => {
  const [country, city, neighborhood] = key.split('|').filter(Boolean)
  return { country, city, neighborhood }
}

export const buildLocationKey = (
  country: string,
  city?: string,
  neighborhood?: string
): string => {
  return [country, city, neighborhood].filter(Boolean).join('|')
}
```

### Extract Collection Configuration Factory
Create: `src/features/data/shared/factories/travelDataCollectionFactory.ts`

```typescript
export const createTravelDataCollection = (config: {
  slug: string
  label: string
  types: Array<{ label: string; value: string }>
}): CollectionConfig => {
  return {
    slug: config.slug,
    labels: { singular: config.label, plural: config.label },
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
      // Common fields: title, slug, tabs, status
      // Types passed via config
    ],
    hooks: {
      beforeChange: [generateSlugHook],
    },
  }
}
```

Then each collection becomes:
```typescript
// dining/collections/Dining.ts
export const Dining = createTravelDataCollection({
  slug: 'dining',
  label: 'Dining',
  types: [
    { label: 'Restaurant', value: 'restaurant' },
    { label: 'Cafe', value: 'cafe' },
    // ...
  ],
})
```

This reduces each collection from 128 lines to ~20 lines.

---

## 10. Summary of Issues

| Issue | Type | Severity | Effort to Fix |
|-------|------|----------|--------------|
| Cascading re-renders (Effect 5 dependencies) | Performance bug | Medium | 5 min |
| LocationDisplay field not syncing | UX bug | High | 30 min |
| Dining missing locationDisplay field | UX bug | Medium | 10 min |
| Type cast hack in Dining | Type safety | Low | 5 min |
| 5 identical LocationPickerField copies | Architecture | High | 2 hours |
| Editor cannot update their own items | Feature design | Low | 1 hour discussion |
| 128 + 257 line files (monolithic) | Code organization | Medium | 3 hours refactoring |

---

## 11. Next Steps

1. **Quick wins** (< 30 min):
   - Fix Effect 5 dependency array
   - Add locationDisplay field to Dining
   - Remove type cast hack

2. **Medium effort** (1-2 hours):
   - Extract shared LocationPickerField to `src/features/data/shared/`
   - Update all 5 collections to import from shared location
   - Create shared type definitions

3. **Major refactoring** (3+ hours):
   - Extract location utilities (parsing, validation)
   - Create collection factory pattern
   - Break LocationPickerField into smaller, testable components
   - Add unit tests for location logic

4. **Documentation**:
   - Add JSDoc comments to LocationPickerField
   - Document the location hierarchy format
   - Create API documentation for location endpoints

---

## Appendix: Location Data Format

### LocationKey Format
```
Format: "Country|City|Neighborhood"
Examples:
- "France" (country-only)
- "France|Paris" (country + city)
- "France|Paris|Marais" (fully hierarchical)
```

### Location Record Structure (from Locations collection)
```typescript
{
  id: 1,
  country: "France",
  city: null,        // null = country-level record
  neighborhood: null,
  locationKey: "France"
}

{
  id: 2,
  country: "France",
  city: "Paris",
  neighborhood: null, // null = city-level record
  locationKey: "France|Paris"
}

{
  id: 3,
  country: "France",
  city: "Paris",
  neighborhood: "Marais",
  locationKey: "France|Paris|Marais"
}
```

**Filtering logic in LocationPickerField**:
- Countries: `!doc.city && !doc.neighborhood`
- Cities: `country===selected && !doc.neighborhood`
- Neighborhoods: `country===selected && city===selected`
