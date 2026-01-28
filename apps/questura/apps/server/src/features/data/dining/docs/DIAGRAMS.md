# Dining Feature - Visual Diagrams

This document contains detailed diagrams showing the architecture, data flow, and state management of the Dining collection.

---

## Component Architecture

### Current State (Monolithic)

```
src/features/data/dining/
│
├── collections/
│   ├── Dining.ts (128 lines)
│   │   ├── Collection config
│   │   ├── Field definitions (title, slug, type, description, etc.)
│   │   ├── Access control rules
│   │   └── beforeChange hook (slug generation)
│   │
│   └── index.ts
│       └── Export Dining config
│
└── admin/
    └── LocationPickerField.tsx (257 lines)
        ├── State management (5 useState)
        ├── Data fetching (1 useEffect)
        ├── Location parsing (1 useEffect)
        ├── City filtering (1 useEffect)
        ├── Neighborhood filtering (1 useEffect)
        ├── Form field updates (1 useEffect)
        └── JSX UI rendering
```

**Problem**: Identical copies exist in:
- dining/admin/LocationPickerField.tsx
- accommodations/admin/LocationPickerField.tsx
- attractions/admin/LocationPickerField.tsx
- nightlife/admin/LocationPickerField.tsx
- affiliate/admin/LocationPickerField.tsx

---

### Proposed Refactored State (Modular)

```
src/features/data/
│
├── shared/
│   ├── components/
│   │   └── LocationPickerField.tsx (130 lines)
│   │       └── Clean UI-only component
│   │
│   ├── hooks/
│   │   ├── useLocationData.ts (40 lines)
│   │   │   └── Fetch & parse locations
│   │   │
│   │   ├── useLocationFiltering.ts (100 lines)
│   │   │   └── Manage cascading dropdowns
│   │   │
│   │   └── useSlugGeneration.ts (20 lines)
│   │       └── Generate slugs from titles
│   │
│   ├── utils/
│   │   └── location.ts (50 lines)
│   │       ├── parseLocationKey()
│   │       ├── buildLocationKey()
│   │       ├── formatLocationDisplay()
│   │       └── isValidLocationKey()
│   │
│   ├── types/
│   │   └── location.ts (20 lines)
│   │       ├── LocationOption
│   │       ├── LocationSelection
│   │       └── LocationParts
│   │
│   └── factories/
│       └── travelDataCollection.ts (80 lines)
│           └── createTravelDataCollection()
│
├── dining/
│   ├── collections/
│   │   ├── Dining.ts (30 lines) ← 77% smaller!
│   │   └── index.ts
│   │
│   └── docs/
│       └── [This documentation]
│
├── accommodations/
│   ├── collections/
│   │   ├── Accommodations.ts (30 lines) ← Simplified
│   │   └── index.ts
│   │
│   └── admin/
│       └── [LocationPickerField removed - uses shared]
│
└── [attractions, nightlife, affiliate - same as accommodations]
```

---

## LocationPickerField State Management

### Current State Tree (Before Refactoring)

```
LocationPickerField Component
│
├─ State
│  ├─ selectedCountry: string
│  ├─ selectedCity: string
│  ├─ selectedNeighborhood: string
│  ├─ countries: LocationOption[]
│  ├─ cities: LocationOption[]
│  ├─ neighborhoods: LocationOption[]
│  ├─ allLocations: LocationOption[]
│  └─ isLoading: boolean
│
├─ Effects (5 total)
│  ├─ Effect #1: Fetch locations
│  │  ├─ Runs: Once on mount []
│  │  └─ Updates: allLocations, countries, isLoading
│  │
│  ├─ Effect #2: Parse saved value
│  │  ├─ Runs: When [isLoading, value, allLocations] change
│  │  └─ Updates: selectedCountry, selectedCity, selectedNeighborhood
│  │
│  ├─ Effect #3: Filter cities
│  │  ├─ Runs: When [selectedCountry, allLocations] change
│  │  └─ Updates: cities, selectedCity, selectedNeighborhood, neighborhoods
│  │
│  ├─ Effect #4: Filter neighborhoods
│  │  ├─ Runs: When [selectedCountry, selectedCity, allLocations] change
│  │  └─ Updates: neighborhoods, selectedNeighborhood
│  │
│  └─ Effect #5: Update form field (BUG HERE!)
│     ├─ Runs: When selection changes OR array references change
│     ├─ Dependency array: [selectedCountry, selectedCity, selectedNeighborhood,
│     │                     countries, cities, neighborhoods, setValue]
│     │                                ↑
│     │                     These cause re-renders!
│     └─ Updates: Payload form field via setValue()
│
└─ UI
   ├─ Display box (shows current value)
   ├─ Country select
   ├─ City select (conditional)
   └─ Neighborhood select (conditional)
```

### Effect Dependencies (Problematic)

```
Effect #1 (Fetch)
  Dependencies: []
  Runs: Once ✅

Effect #2 (Parse)
  Dependencies: [isLoading, value, allLocations]
  Runs after #1 completes ✅

Effect #3 (Filter Cities)
  Dependencies: [selectedCountry, allLocations]
  Runs after #2 selects country ✅

Effect #4 (Filter Neighborhoods)
  Dependencies: [selectedCountry, selectedCity, allLocations]
  Runs after #3 selects city ✅

Effect #5 (Update Form) ❌ PROBLEM!
  Dependencies: [selectedCountry, selectedCity, selectedNeighborhood,
                 countries, cities, neighborhoods, setValue]
                 ↑ These are NEW array references every time!

  What happens:
  1. Effect #3 runs → creates NEW cities array
  2. Effect #5 dependencies include cities array
  3. Array reference changed → Effect #5 runs again
  4. This runs setValue() again
  5. Which might trigger cascading updates

  Solution: Remove array dependencies
  Dependencies: [selectedCountry, selectedCity, selectedNeighborhood, setValue]
```

---

## Data Flow - Complete Journey

### User Opens Dining Form (Create)

```
┌─ User clicks "Create New Dining" ─┐
│                                   │
│  Payload Admin Opens Form          │
│  ├─ title: (empty)                 │
│  ├─ slug: (empty)                  │
│  ├─ type: (empty dropdown)         │
│  ├─ description: (empty)           │
│  ├─ featuredImage: (empty)         │
│  ├─ locationDisplay: (empty)       │
│  ├─ location: (empty)              │
│  └─ status: "draft" (default)      │
│                                   │
└─────────┬──────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────┐
│ LocationPickerField Component Mounts        │
│ useField({ path: "location" }) → value="" │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
           ┌──────────────────┐
           │ Effect #1: Load  │
           │ Fetch locations  │
           │ GET /api/        │
           │ locations?       │
           │ limit=1000       │
           └────────┬─────────┘
                    │
                    ↓
           ┌──────────────────┐
           │ API Response:    │
           │ [{              │
           │  id: 1,         │
           │  country:"USA"  │
           │ }, {            │
           │  id: 2,         │
           │  country:"USA"  │
           │  city:"NYC"     │
           │ }, ...]         │
           │                 │
           │ Store in:       │
           │ allLocations[]  │
           │ countries[]     │
           │ isLoading=false │
           └────────┬────────┘
                    │
                    ↓
           ┌──────────────────┐
           │ Effect #2: Parse │
           │ value is empty   │
           │ Skip parsing     │
           └────────┬─────────┘
                    │
                    ↓
           ┌──────────────────┐
           │ UI Ready:        │
           │ Show countries   │
           │ dropdown         │
           └────────┬─────────┘
                    │
                    ↓
         ┌─────────────────────────┐
         │ User Selects Country    │
         │ "United States"         │
         │ setSelectedCountry("1") │
         └──────────┬──────────────┘
                    │
                    ↓
          ┌──────────────────┐
          │ Effect #3: Filter│
          │ cities array:    │
          │ allLocations     │
          │   .filter(loc => │
          │   loc.country    │
          │   === "USA"      │
          │   && !loc.nbhd   │
          │ )               │
          │                 │
          │ setCities([...])│
          └────────┬────────┘
                   │
                   ↓
          ┌──────────────────┐
          │ Effect #5: Update│
          │ (maybe) -        │
          │ selectedCountry  │
          │ but no city/nbhd │
          │ So value stays "" │
          └────────┬────────┘
                   │
                   ↓
         ┌─────────────────────────┐
         │ UI Updates:             │
         │ Show city dropdown now  │
         └──────────┬──────────────┘
                    │
                    ↓
        ┌────────────────────────┐
        │ User Selects City      │
        │ "New York City"        │
        │ setSelectedCity("2")   │
        └──────────┬─────────────┘
                   │
                   ↓
          ┌──────────────────┐
          │ Effect #4: Filter│
          │ neighborhoods:   │
          │ allLocations     │
          │   .filter(loc => │
          │   loc.country    │
          │   === "USA"      │
          │   && loc.city    │
          │   === "NYC"      │
          │ )               │
          │                 │
          │ setNeighborhoods│
          │ ([...])         │
          └────────┬────────┘
                   │
                   ↓
          ┌──────────────────┐
          │ Effect #5: Update│
          │ setValue(        │
          │  "USA|NYC"       │
          │ )                │
          │                 │
          │ location field   │
          │ = "USA|NYC"      │
          └────────┬────────┘
                   │
                   ↓
         ┌─────────────────────────┐
         │ UI Updates:             │
         │ Show neighborhood list  │
         │ Show "Current location: │
         │ USA|NYC" in blue box    │
         └──────────┬──────────────┘
                    │
                    ↓
       ┌────────────────────────┐
       │ User Selects Nbhd      │
       │ "Manhattan"            │
       │ setSelectedNbhd("5")   │
       └──────────┬─────────────┘
                  │
                  ↓
         ┌──────────────────┐
         │ Effect #5: Update│
         │ setValue(        │
         │  "USA|NYC|       │
         │   Manhattan"     │
         │ )                │
         │                 │
         │ location field   │
         │ = "USA|NYC|      │
         │   Manhattan"     │
         └────────┬────────┘
                  │
                  ↓
        ┌─────────────────────────┐
        │ Form State Now:         │
        │ ├─ title: (user typed)  │
        │ ├─ location:"USA|NYC|   │
        │ │  Manhattan"           │
        │ ├─ status: "draft"      │
        │ └─ ...other fields...   │
        │                         │
        │ User clicks [Save]      │
        └──────────┬──────────────┘
                   │
                   ↓
          ┌──────────────────┐
          │ beforeChange Hook│
          │ if (title &&     │
          │   !slug) {       │
          │   slug = gen()   │
          │ }                │
          │                 │
          │ slug = "french- │
          │ restaurant-nyc" │
          └────────┬────────┘
                   │
                   ↓
        ┌─────────────────────┐
        │ Save to Database    │
        │                     │
        │ Dining {            │
        │  id: 123,           │
        │  title: "French     │
        │  Restaurant NYC",   │
        │  slug: "french-     │
        │  restaurant-nyc",   │
        │  location:          │
        │  "USA|NYC|         │
        │  Manhattan",        │
        │  status: "draft"    │
        │ }                   │
        └─────────────────────┘
```

---

## User Role Access Flow

### Scenario 1: Public User Views Published Item

```
Request: GET /api/dining/123
  ↓
Payload evaluates access.read
  ├─ Is req.user set?
  ├─ NO → user is public
  └─ Return filter: { status: { equals: 'published' } }
     ↓
Filter applied to query
  └─ WHERE status = 'published'
     ↓
Check if item matches filter
  ├─ Item has status='published'?
  ├─ YES → Include in results ✅
  └─ NO → Exclude from results ❌
     ↓
Return JSON response
```

### Scenario 2: Editor Tries to Edit

```
Request: PATCH /api/dining/123
{
  "title": "Updated Title"
}
  ↓
Payload evaluates access.update
  ├─ req.user?.role === 'admin'?
  ├─ NO (editor, not admin)
  └─ Return false ❌
     ↓
Access denied!
  ├─ Status: 403 Forbidden
  ├─ Message: "You don't have permission"
  └─ Changes NOT saved
```

### Scenario 3: Admin Publishes Draft

```
Request: PATCH /api/dining/123
{
  "status": "published"
}
  ↓
Payload evaluates access.update
  ├─ req.user?.role === 'admin'?
  ├─ YES
  └─ Return true ✅
     ↓
beforeChange hook runs
  ├─ Check: data.title && !data.slug
  ├─ slug exists? YES
  └─ Skip slug generation
     ↓
Document updated
  ├─ status: 'draft' → 'published'
  └─ Saved to database ✅
     ↓
Item now visible to public
  └─ GET /api/dining/123 works for all users
```

---

## Location Hierarchy Visualization

### Location Data Structure

```
┌─ Locations Collection ─┐
│                        │
│ Record #1:            │
│ ├─ country: "France"  │
│ ├─ city: null         │
│ ├─ neighborhood: null │
│ └─ locationKey:       │
│    "France"           │
│                        │
├─ Record #2:           │
│ ├─ country: "France"  │
│ ├─ city: "Paris"      │
│ ├─ neighborhood: null │
│ └─ locationKey:       │
│    "France|Paris"     │
│                        │
├─ Record #3:           │
│ ├─ country: "France"  │
│ ├─ city: "Paris"      │
│ ├─ neighborhood: "Le  │
│ │  Marais"            │
│ └─ locationKey:       │
│    "France|Paris|     │
│    Le Marais"         │
│                        │
└─ Record #4:           │
  ├─ country: "France"  │
  ├─ city: "Paris"      │
  ├─ neighborhood:      │
  │  "Champs-Élysées"   │
  └─ locationKey:       │
     "France|Paris|     │
     Champs-Élysées"    │
```

### Filtering Logic

```
Step 1: Load Countries
═══════════════════════

allLocations = [
  { id:1, country:"France", city:null, neighborhood:null, locationKey:"France" },
  { id:2, country:"France", city:"Paris", neighborhood:null, locationKey:"France|Paris" },
  { id:3, country:"France", city:"Paris", neighborhood:"Marais", locationKey:"..." },
  { id:4, country:"USA", city:null, neighborhood:null, locationKey:"USA" },
  ...
]

Filter: where !city && !neighborhood

countries = [
  { id:1, country:"France", ... },
  { id:4, country:"USA", ... },
  ...
]

Dropdown shows: "France", "USA", ...


Step 2: User Selects "France" (id=1)
════════════════════════════════════

Find country doc: allLocations[0] = { country:"France", ... }
Extract: countryName = "France"

Filter: where country=="France" AND !neighborhood

cities = [
  { id:2, country:"France", city:"Paris", neighborhood:null, ... },
  { id:5, country:"France", city:"Lyon", neighborhood:null, ... },
  ...
]

Dropdown shows: "Paris", "Lyon", ...


Step 3: User Selects "Paris" (id=2)
═══════════════════════════════════

Find city doc: allLocations[1] = { city:"Paris", ... }
Extract: cityName = "Paris"

Filter: where country=="France" AND city=="Paris"

neighborhoods = [
  { id:3, country:"France", city:"Paris", neighborhood:"Marais", ... },
  { id:6, country:"France", city:"Paris", neighborhood:"Champs-Élysées", ... },
  ...
]

Dropdown shows: "Marais", "Champs-Élysées", ...


Step 4: User Selects "Marais" (id=3)
═════════════════════════════════════

Find neighborhood doc: allLocations[2] = { locationKey:"France|Paris|Marais", ... }
Extract: locationKey = "France|Paris|Marais"

setValue(locationKey)

Form field updates: location = "France|Paris|Marais"
```

---

## State Change Timeline

### Creating a Dining Item (Complete Flow)

```
Time Event                          State Change
────────────────────────────────────────────────────────────
 T0  Form opens (create mode)       location: ""
                                    selectedCountry: ""
                                    selectedCity: ""
                                    selectedNeighborhood: ""
                                    isLoading: true
                                    countries: []
                                    cities: []
                                    neighborhoods: []

 T1  Effect #1: Fetch completes     isLoading: false
                                    allLocations: [...1000 docs...]
                                    countries: [France, USA, ...]

 T2  Effect #2: Skip (no value)     (no change)

 T3  User selects "France"          selectedCountry: "1"

 T4  Effect #3: Filter cities       cities: [Paris, Lyon, ...]
                                    selectedCity: ""
                                    selectedNeighborhood: ""
                                    neighborhoods: []

 T5  Effect #5: Update field (*)    location: "France"
                                    (setValue called)

 T6  User selects "Paris"           selectedCity: "2"

 T7  Effect #4: Filter nbhds        neighborhoods: [Marais, ...]
                                    selectedNeighborhood: ""

 T8  Effect #5: Update field (*)    location: "France|Paris"

 T9  User selects "Marais"          selectedNeighborhood: "3"

T10  Effect #5: Update field (*)    location: "France|Paris|Marais"

T11  User types title               title: "Le Marais Restaurant"

T12  User clicks [Save]             (trigger form submission)

T13  beforeChange: Generate slug    slug: "le-marais-restaurant"

T14  Save to database               Document inserted
                                    status: "draft"
                                    location: "France|Paris|Marais"

T15  Form saved response            location: "France|Paris|Marais"
                                    locationDisplay: "" (❌ BUG)
                                    (not in sync!)
```

**(*) Note**: Effect #5 runs because dependency array includes array references that change. With the fix, it would only run on selection changes.

---

## Bug Reproduction Timeline

### Bug #1: Cascading Re-renders (Effect #5)

```
User selects country "France"
  ↓
Effect #3 runs → creates NEW cities array
  ├─ setCities([{id:2, city:"Paris"}, ...])
  └─ This is a NEW array object
  ↓
Effect #5 dependency array includes "cities"
  ├─ Old cities: [old refs]
  ├─ New cities: [new refs]
  ├─ Reference changed! 🔄
  └─ Effect #5 runs again!
  ↓
Effect #5 runs → calls setValue()
  ├─ Might trigger re-renders in parent
  └─ Could cause cascading updates
  ↓
Could also trigger Effect #3 again if it depends on something
  └─ Potential infinite loop risk (low, but possible)
```

### Bug #2: LocationDisplay Not Syncing

```
T0  Form loads
    locationDisplay: "France|Paris|Marais" (from defaultValue)
    location: "France|Paris|Marais" (from saved data)
    ✅ In sync

T1  User selects country "USA"
    locationDisplay: "France|Paris|Marais" (unchanged)
    location: (parsing...) (will update)
    ❌ Out of sync

T2  User selects city "NYC"
    locationDisplay: "France|Paris|Marais" (still old)
    location: "USA|NYC" (updated)
    ❌ Still out of sync

T3  User saves
    beforeChange hook doesn't touch locationDisplay
    locationDisplay stays: "France|Paris|Marais" (wrong!)
    location: "USA|NYC" (correct)
    ❌ Database has wrong locationDisplay

T4  Form reloads after save
    defaultValue runs again
    locationDisplay: "USA|NYC" (from new data)
    ✅ Back in sync, but only because of reload
```

---

## Refactored Architecture Diagram

### After Phase 3: Consolidated Components

```
PayloadCMS Admin
    ↓
DiningCollection Config
├─ Uses createTravelDataCollection()
│  └─ Imports from shared factory
├─ minimal config (slug, types, etc.)
└─ Imports LocationPickerField from shared
    ↓
LocationPickerField (shared)
├─ Imports useLocationData hook
├─ Imports useLocationFiltering hook
├─ Uses formatLocationDisplay utility
├─ Cleaner, 130 lines (was 257)
└─ Single source of truth for ALL collections
    ↓
useLocationData Hook
├─ Fetches /api/locations
├─ Returns countries & allLocations
└─ Tested independently

useLocationFiltering Hook
├─ Manages selectedCountry/City/Neighborhood
├─ Handles cascading filters
├─ Tested independently
└─ Reusable for other components

location.ts Utilities
├─ parseLocationKey()
├─ buildLocationKey()
├─ formatLocationDisplay()
└─ Fully tested, no UI dependencies
```

**Benefits**:
- Bug fix in LocationPickerField applies to all 5 collections
- Hooks are testable independently
- Utils have no Payload dependencies
- Each piece has single responsibility

---

## Summary

These diagrams show:
1. **Component architecture** - How files are organized
2. **State management** - All the useState calls and effects
3. **Data flow** - Complete journey from form open to save
4. **Access control** - Who can do what
5. **Location hierarchy** - How country→city→neighborhood works
6. **Bugs** - Specific timelines showing issues
7. **Refactoring** - How it should be structured

For implementation details, see **REFACTORING_ROADMAP.md**.
