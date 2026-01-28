# Rankings Feature

Multi-step form system for creating ranked lists of travel destinations with sophisticated state management and validation.

## Overview

The Rankings feature enables editors to create rankings like "Top 10 Dining in Paris" by guiding them through a two-step workflow:

1. **Step 1 (Setup)**: Location, ranking type, and title
2. **Step 2+ (Content)**: Ranked items, featured image, and publication status

## Architecture

### Directory Structure

```
rankings/
├── collections/              # Payload collection definitions
│   ├── Rankings.ts           # Main collection config with hooks
│   ├── fields/               # Field definitions split by concern
│   │   ├── state.ts          # Hidden flags (step1_complete, in_update_mode)
│   │   ├── step1.ts          # Step 1 fields (location, rankingType, title)
│   │   ├── details.ts        # Step 2+ fields (featured image, status)
│   │   ├── items.ts          # Block array field
│   │   └── index.ts
│   └── index.ts
├── components/               # Custom Payload admin UI components
│   ├── Step1Wrapper.tsx      # Multi-step workflow orchestration
│   ├── SmartField.tsx        # Conditional locked/unlocked field display
│   ├── RankingsBlocksField.tsx # Dynamic block filtering
│   ├── LockedField.tsx       # Read-only field display (unused)
│   └── Step1Wrapper.module.css
├── hooks/                    # Custom React hooks (NEW)
│   ├── useStep1Workflow.ts   # State machine for multi-step form
│   ├── useBlockFiltering.ts  # Dynamic block filtering logic
│   └── index.ts
├── blocks/                   # Block type definitions
│   ├── index.ts              # Block exports and getBlocksForType()
│   ├── DataDiningBlock.ts
│   ├── DataAccommodationsBlock.ts
│   ├── DataAttractionsBlock.ts
│   └── DataNightlifeBlock.ts
└── README.md                 # This file
```

## State Flow

```
┌─────────────────────────────────────────────────────┐
│                   INITIAL STATE                      │
│  step1_complete: false                              │
│  in_update_mode: false                              │
│                                                      │
│  Visible: Location, RankingType, Title, Continue    │
│  Hidden: Featured Image, Items, Status              │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ User fills all Step 1 fields
                   │ and clicks Continue
                   ▼
┌─────────────────────────────────────────────────────┐
│                STEP 2+ STATE                         │
│  step1_complete: true                               │
│  in_update_mode: false                              │
│                                                      │
│  Locked: Location, RankingType, Title (read-only)   │
│  Visible: Featured Image, Items (filtered), Status  │
│  Buttons: Update Setup                              │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ User clicks "Update Setup"
                   ▼
┌─────────────────────────────────────────────────────┐
│               UPDATE MODE STATE                      │
│  step1_complete: true                               │
│  in_update_mode: true                               │
│                                                      │
│  Unlocked: Location, RankingType, Title             │
│  Hidden: Featured Image, Items, Status              │
│  Buttons: Cancel Update                             │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ User changes RankingType or Location
                   ▼
        ┌──────────────────────┐
        │ Show confirmation    │
        │ "Clear Items?"       │
        └──────────────────────┘
              │            │
      ┌───────┘            └────────┐
      │ "Clear & Continue"          │ "Keep Items"
      ▼                             ▼
   Clear items        Revert field value
   Exit update mode   Close dialog
   (back to Step 2+)
```

## Key Concepts

### 1. Hidden State Management

The feature uses hidden boolean fields to control form behavior:

- **`step1_complete`**: Switches between Step 1 setup mode and Step 2+ content mode
- **`in_update_mode`**: Allows editing Step 1 fields after initial completion
- **`location_finalized`**: Reserved for future use

These flags control field visibility via Payload's `admin.condition` property.

### 2. Three-Layer Validation

```
Layer 1: UI Validation (Step1Wrapper)
├─ User clicks Continue
├─ Component validates all fields present
└─ Shows error messages if validation fails

Layer 2: Field Locking (SmartField)
├─ Once step1_complete=true, fields become read-only
├─ Prevents accidental modification
└─ User must click "Update Setup" to edit again

Layer 3: Database Validation (Rankings.ts beforeValidate hook)
├─ Verify step1_complete=true on save
├─ Filter blocks that don't match ranking type
└─ Acts as safety net for API-direct mutations
```

### 3. Block Filtering

The feature prevents mixing incompatible block types through two-stage filtering:

**UI Stage** (`RankingsBlocksField` component):
- Reads `rankingType` from form state
- Calls `getBlocksForType()` to get the single matching block type
- Replaces BlocksField's blocks array dynamically
- User sees only compatible blocks

**Database Stage** (`Rankings.ts` beforeValidate hook):
- Filters items array to match ranking type
- Removes any blocks that don't match
- Prevents invalid data from being saved

## Custom Hooks

### useStep1Workflow

Encapsulates all state machine logic for the multi-step form.

**Returns:**
- Form field values (location, rankingType, title, step1_complete, in_update_mode)
- Computed state (isStep1Complete)
- Validation state (validationErrors)
- Dialog state (showConfirmDialog, pendingChange)
- Event handlers (handleContinue, handleUpdate, handleConfirmChange, etc.)

**Usage:**
```typescript
const workflow = useStep1Workflow()
// Use workflow.handleContinue, workflow.validationErrors, etc.
```

**Benefits:**
- Separates logic from rendering
- Makes Step1Wrapper much simpler
- Reusable if multiple components need the same workflow

### useBlockFiltering

Encapsulates block filtering logic for dynamic block availability.

**Returns:**
- rankingType: Current ranking type from form
- availableBlocks: Filtered blocks for the ranking type
- modifiedField: Function to apply filtering to field config

**Usage:**
```typescript
const { rankingType, modifiedField } = useBlockFiltering(props.field)
return <BlocksField {...props} field={modifiedField(props.field)} />
```

**Benefits:**
- Centralizes block filtering logic
- Makes RankingsBlocksField very simple
- Reusable in other components if needed

## Components

### Step1Wrapper

Orchestrates the multi-step form workflow.

**Responsibilities:**
- Render Continue button when Step 1 incomplete
- Render Update Setup button when Step 1 complete
- Show/hide confirmation dialog when fields change
- Display validation errors

**Updated:** Now uses `useStep1Workflow` hook for all logic

### SmartField

Conditional field component that shows different UI based on form state.

**Locked Mode** (when `step1_complete && !in_update_mode`):
- Displays as read-only text
- Prevents accidental modification

**Unlocked Mode** (when `!step1_complete || in_update_mode`):
- Shows editable input/select
- Allows editing

**Used For:** Location, RankingType, Title fields

### RankingsBlocksField

Intercepts Payload's BlocksField and filters available blocks.

**Flow:**
1. Reads rankingType from form state
2. Gets matching blocks via getBlocksForType()
3. Replaces BlocksField's blocks array
4. Re-renders when rankingType changes (via key={rankingType})

**Updated:** Now uses `useBlockFiltering` hook for filtering logic

## Field Organization

### State Fields (Hidden)

```typescript
// Flags controlling form behavior
step1_complete: false      // Step 1 complete?
in_update_mode: false      // Editing Step 1?
location_finalized: false  // Reserved for future use
```

### Step 1 Fields (Visible when step1_complete=false)

```typescript
location: string           // Custom LocationPickerField
rankingType: enum          // dining|accommodations|attractions|nightlife
title: string              // Text input with SmartField
step1UiWrapper: string     // Render-only, shows Step1Wrapper component
```

### Step 2+ Fields (Visible when step1_complete=true && !in_update_mode)

```typescript
detailsTabs: tabs          // Featured image, status
items: blocks              // Filtered block array with RankingsBlocksField
```

## Block Types

Each ranking type maps to a single block type:

| Ranking Type | Block Type | Referenced Collection |
|---|---|---|
| dining | data-dining | dining |
| accommodations | data-accommodations | accommodations |
| attractions | data-attractions | attractions |
| nightlife | data-nightlife | nightlife |

Each block has:
- `item`: Relationship to data collection item (required)
- `selectedImage`: Optional featured image
- `description`: Optional description/rationale

## Database Hooks

### beforeChange

Generates URL-friendly slug from title on create.

### beforeValidate

Two-part validation:

1. **Step 1 Completion Check**
   - Verifies `step1_complete=true` on create/update
   - Throws error if incomplete
   - Ensures all rankings have location, type, and title

2. **Block Type Filtering**
   - Gets valid blocks for ranking type
   - Filters out any items with mismatched block type
   - Prevents invalid data combinations
   - Acts as safety net against API bypasses

## Common Workflows

### Creating a New Ranking

1. Admin opens Rankings collection → blank form loads
2. Fills location, ranking type, title
3. Clicks Continue button
4. Step1Wrapper validates all fields
5. form state updates: step1_complete=true
6. Step 2+ fields appear (featured image, items)
7. RankingsBlocksField filters blocks to matching type
8. Admin adds items of the selected type
9. Clicks Payload save button
10. beforeValidate hook ensures step1_complete=true and blocks match
11. Document saved

### Editing an Existing Ranking

1. Admin opens existing ranking (step1_complete=true)
2. Clicks "Update Setup" button
3. in_update_mode=true
4. Step 1 fields unlock
5. Admin changes rankingType or location
6. Step1Wrapper shows confirmation: "Clear Ranking Items?"
7. Admin clicks "Clear & Continue"
8. items array clears, in_update_mode=false
9. Step 2+ fields reappear
10. RankingsBlocksField shows new block type
11. Admin adds new items
12. Form submits successfully

## Customization

### Adding a New Ranking Type

1. Create new data collection (e.g., `museums`)
2. Create new block type: `DataMuseumsBlock.ts`
3. Export from `blocks/index.ts`
4. Update `getBlocksForType()` to map 'museums' → [DataMuseumsBlock]
5. Add 'museums' option to `rankingType` field in `step1.ts`
6. Update field in Collections (no code changes needed)

### Changing Step 1 Fields

1. Add/remove field in `collections/fields/step1.ts`
2. Update validation in `useStep1Workflow.ts`
3. Update Step1Wrapper if new UI needed

### Modifying Workflow Logic

Edit `hooks/useStep1Workflow.ts` to change:
- Validation rules
- State transitions
- Confirmation dialogs
- Change detection

## Debugging

### Common Issues

**Items not clearing when changing ranking type:**
- Check `handleConfirmChange` in useStep1Workflow
- Verify Step1Wrapper is calling the handler
- Check beforeValidate hook is filtering blocks

**Blocks not filtering properly:**
- Check `getBlocksForType()` returns correct block
- Check RankingsBlocksField is reading rankingType
- Verify key={rankingType} is present (forces re-render)

**Step 1 fields still editable after Continue:**
- Check SmartField is using isLocked calculation
- Verify step1_complete flag was set to true
- Check field is using SmartField component

### Debug Logging

Check browser console for:
```typescript
[RankingsBlocksField] rankingType: dining
[RankingsBlocksField] availableBlocks: [{ slug: 'data-dining' }]
```

Check server console for:
```typescript
Removing block type "data-attractions" from ranking of type "dining" - block type mismatch
```

## Testing

### Test Scenarios

1. **Happy Path**: Create ranking with all steps → Verify saved
2. **Validation**: Try to click Continue without all fields → Verify error shows
3. **Block Filtering**: Select dining → Add dining item → Add non-dining item (should fail/hide)
4. **Update Workflow**: Create ranking → Click Update → Change type → Verify items cleared
5. **Confirmation Dialog**: Update → Change type → Click "Keep Items" → Verify reverted

## Performance Considerations

- `useStep1Workflow` uses useCallback for handlers (stable references)
- `useBlockFiltering` uses useMemo for blocks (avoid re-computing)
- Step1Wrapper re-renders only when workflow state changes
- RankingsBlocksField uses key={rankingType} to force BlocksField re-render

## Future Improvements

- Extract LocationPickerField logic into useLocationPicker hook
- Create shared types file (rankings.types.ts) for better type safety
- Consider consolidating field definitions into single file
- Add comprehensive unit tests for hooks
- Create Storybook stories for components

## References

- **Payload CMS**: https://payloadcms.com
- **useFormFields Hook**: Payload UI hook for reading form state
- **useField Hook**: Payload UI hook for accessing individual field setter
- **admin.condition**: Payload field property for conditional visibility
- **beforeValidate Hook**: Payload collection hook for pre-save validation
