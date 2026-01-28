# Location Picker Module

A custom Payload CMS field component for selecting hierarchical locations (country → city → neighborhood).

## Overview

The location picker provides an interactive, collapsible dropdown interface for users to select a specific location when creating rankings in the Questura platform. It manages a three-level location hierarchy and syncs selections with Payload form fields.

## Data Format

Locations are stored as **pipe-delimited strings**:

```
country|city|neighborhood
```

**Examples:**
- `colombia` - Just the country
- `colombia|bogota` - Country and city
- `colombia|bogota|santa-teresita` - Full three-level location

The format supports partial selections (country-only or country+city), but typically the most specific level selected is stored.

## Architecture

### Components

**LocationPickerField.tsx** (Main Component)
- Entry point: custom Payload CMS field component
- Orchestrates data loading, selection management, form sync, and rendering
- Shows either:
  - Collapsed view (location selected) with "Edit" button
  - Expanded view (picker open) with cascading dropdowns
  - Read-only view (step 1 complete, not in update mode)

**Sub-components:**
- `LocationDisplayBox` - Shows selected location in formatted text with Edit button
- `AddLocationButton` - Button to start selection when no location exists
- `LocationDropdowns` - Container for the three cascading select dropdowns
- `SelectField` - Reusable dropdown component

### Hooks

**useLocationData.ts**
- Fetches all locations from `/api/locations` endpoint
- Returns: `{ countries, isLoading, allLocations }`
- Filters out country-only entries from countries array

**useLocationSelection.ts**
- Manages cascading dropdown state (country → city → neighborhood)
- Parses saved location values on initial load
- Handles filtering when selections change
- Key feature: Uses `prevCountryRef` / `prevCityRef` pattern to distinguish user interaction from initial population
  - Only clears dependent dropdowns when user actually changes the parent, not during form load

**usePickerExpanded.ts**
- Manages UI expansion state (collapsed vs expanded)
- Detects "Done" button clicks (expanded → collapsed transition)
- Returns: `{ isExpanded, setIsExpanded, doneWasClicked }`

**useDetectChange.ts**
- Utility hook for detecting value changes from user interaction
- Distinguishes between initial render and subsequent changes
- Used internally by `usePickerExpanded`

### Utilities

**utils/index.ts**

- `parseLocationValue(value)` - Parses pipe-delimited string to `{ country, city, neighborhood }`
- `buildLocationDisplay()` - Formats location as breadcrumb: `"Country > City > Neighborhood"`
- `formatLocationName()` - Transforms names: `"santa-teresita"` → `"Santa Teresita"`
- `formatLocationForDisplay()` - End-to-end formatting: `"colombia|bogota"` → `"Colombia > Bogota"`
- `filterCitiesByCountry()` - Returns cities for selected country
- `filterNeighborhoodsByCity()` - Returns neighborhoods for selected city

## Data Flow

```
User opens Rankings form
    ↓
LocationPickerField mounts
    ↓
useLocationData() fetches all locations from API
    ↓
(If editing) useLocationSelection parses saved location value
    ↓
Dropdowns populate with country options
    ↓
User selects country → useLocationSelection filters cities
    ↓
User selects city → useLocationSelection filters neighborhoods
    ↓
User selects neighborhood → form field updated with locationKey
    ↓
User clicks "Done" → usePickerExpanded detects transition
    ↓
location_finalized flag set → Form validation passes
    ↓
User submits form → Location saved to database
```

## Integration

### Registering in a Collection

```typescript
import { LocationPickerField } from '@/shared/location'

const fields: Field[] = [
  {
    name: 'location',
    type: 'text',
    required: true,
    admin: {
      components: {
        Field: LocationPickerField,
      },
    },
  },
  {
    name: 'locationRef',
    type: 'relationship',
    relationTo: 'locations',
    admin: {
      hidden: true,
    },
  },
  // Hidden field for tracking finalization
  {
    name: 'location_finalized',
    type: 'checkbox',
    admin: {
      hidden: true,
    },
  },
]
```

### Form Context

The picker reads form context to determine visibility:

```typescript
const step1Complete = useFormFields(([fields]) => fields.step1_complete?.value)
const inUpdateMode = useFormFields(([fields]) => fields.in_update_mode?.value)

// Read-only after step 1 is complete (unless in update mode)
if (step1Complete && !inUpdateMode) {
  return <read-only-display />
}
```

## The Ref Pattern Explained

The `useLocationSelection` hook uses `prevCountryRef` and `prevCityRef` to solve a common React problem:

**Problem:** How do you know if a dropdown value changed because:
1. Initial form load (populate all three dropdowns at once)?
2. User actually changed the parent (clear dependent dropdown)?

**Solution:** Use a ref to track the previous value

```typescript
// First render: selectedCountry = '', prevCountryRef.current = ''
// Load value: selectedCountry = '5', prevCountryRef check: '' !== '5' BUT prevCountryRef === '', skip clear
// User changes: selectedCountry = '10', prevCountryRef check: '5' !== '10' AND prevCountryRef !== '', CLEAR
// Update ref: prevCountryRef.current = '10'
```

This pattern appears in two places:
- `useLocationSelection` - distinguishes initial population from country/city changes
- `usePickerExpanded` - detects Done button clicks (expanded → collapsed)

## Type Definitions

**LocationOption**
```typescript
interface LocationOption {
  id: number | string
  country?: string
  city?: string
  neighborhood?: string
  locationKey?: string
  [key: string]: any
}
```

**LocationPickerValue** (Parsed form)
```typescript
interface LocationPickerValue {
  country: string | null
  city: string | null
  neighborhood: string | null
}
```

## Usage Example

```typescript
// In Rankings collection definition
{
  name: 'location',
  type: 'text',
  required: true,
  admin: {
    components: {
      Field: LocationPickerField,
    },
  },
},
```

In the form:
1. Click "+ Add location" to expand picker
2. Select a country from first dropdown
3. Available cities appear in second dropdown
4. Select a city; neighborhoods appear in third dropdown
5. Select a neighborhood (or skip to select country+city)
6. Click "Done" to close picker and finalize selection

## Styling

All styles are centralized in `styles/index.ts`:
- Uses Payload theme variables (`var(--theme-*)`)
- Responsive to expansion state
- Accessible form inputs

## File Structure

```
src/shared/location/
├── README.md                          # This file
├── LocationPickerField.tsx            # Main component
├── index.ts                           # Public exports
├── types/index.ts                     # TypeScript interfaces
├── styles/index.ts                    # Centralized CSS-in-JS
├── utils/index.ts                     # Formatting & filtering utilities
├── components/
│   ├── LocationDisplayBox.tsx
│   ├── AddLocationButton.tsx
│   ├── LocationDropdowns.tsx
│   ├── SelectField.tsx
│   └── index.ts
└── hooks/
    ├── useLocationData.ts             # Data fetching
    ├── useLocationSelection.ts        # Cascading dropdown state
    ├── usePickerExpanded.ts           # UI expansion state
    ├── useDetectChange.ts             # Change detection utility
    └── index.ts
```

## Performance Considerations

- Data fetching happens once on component mount (via `useLocationData`)
- Filtering is fast (filtering array of ~500 locations)
- Cascading updates use stable refs to avoid unnecessary re-renders
- Memoization not needed - component is lightweight

## Current Usage

- Rankings collection (Step 1 form) - select location for ranking

## Future Enhancements

- Add search/filter to dropdown options for large location lists
- Support custom location hierarchies (not just country → city → neighborhood)
- Add location persistence preferences
- Real-time search across location hierarchy
