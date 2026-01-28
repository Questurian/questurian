# Dining Feature Documentation

This directory contains comprehensive documentation for the Dining feature in Questura, a travel data collection system integrated with Payload CMS.

## 📚 Documentation Files

### 1. **ARCHITECTURE.md** (Recommended Start Here)
Deep dive into the Dining feature architecture and data flow.

**Contents**:
- Data structure and database model
- Complete data flow diagram
- Access control rules and visibility
- LocationPickerField component breakdown
- Identified bugs and issues
- Code organization recommendations

**Who should read**:
- Developers implementing features
- Code reviewers
- Anyone debugging Dining-related issues

**Key Insights**:
- The LocationPickerField has 5 coordinated useEffect hooks managing state
- Access control prevents editors from editing their own items (UX trap)
- 95% code duplication across 5 travel data collections
- locationDisplay field doesn't sync in real-time (UI bug)

---

### 2. **VISIBILITY_MATRIX.md** (For Content Managers)
Quick reference for what different users can see and do.

**Contents**:
- Quick reference table (who can see what)
- Detailed visibility matrix
- Publishing workflow diagrams
- API endpoint behavior by user role
- Status field behavior
- Access control timeline scenarios

**Who should read**:
- Content managers
- Product managers
- Anyone asking "why can't the editor edit this?"

**Key Insights**:
- Public sees only published items
- Editors see all items but can't edit them
- Admins have full CRUD access
- There's a UX trap where editors create content they can't edit

---

### 3. **REFACTORING_ROADMAP.md** (For Architects)
Practical refactoring plan to eliminate code duplication.

**Contents**:
- Executive summary of duplication problem
- Phase 1: Quick wins (5-30 min fixes)
- Phase 2: Extract shared code (2 hours)
- Phase 3: Consolidate to shared component (1 hour)
- Phase 4: Collection factory pattern (optional, 2 hours)
- Implementation timeline
- Testing strategy
- Rollback plan

**Who should read**:
- Tech leads planning refactoring
- Senior developers
- Anyone implementing the improvements

**Key Benefits**:
- Bug fixes apply to all 5 collections at once
- Dining.ts reduced from 128 to 30 lines (77% smaller)
- LocationPickerField reduced from 257 to 130 lines (49% smaller)
- Better code maintainability and testability

---

## 🏗️ Project Structure

```
src/features/data/dining/
├── collections/
│   ├── Dining.ts (128 lines)           # Collection config
│   └── index.ts                        # Export Dining
├── admin/
│   └── LocationPickerField.tsx (257 lines)  # Custom form field
└── docs/
    ├── README.md (this file)
    ├── ARCHITECTURE.md
    ├── VISIBILITY_MATRIX.md
    └── REFACTORING_ROADMAP.md
```

---

## 🐛 Critical Issues Found

### Bug #1: Cascading Re-renders (Performance)
**File**: LocationPickerField.tsx line 153
**Severity**: Medium
**Fix Time**: 5 minutes

The last useEffect has too many dependencies in its array, causing unnecessary re-renders.

### Bug #2: Editor Cannot Edit Their Own Items (UX)
**File**: Dining.ts lines 22-23
**Severity**: High
**Impact**: Editors are locked out of editing content they create

### Bug #3: LocationDisplay Field Not Syncing (UX)
**File**: Dining.ts lines 88-99
**Severity**: High
**Impact**: User sees outdated location value while editing

### Bug #4: 95% Code Duplication (Architecture)
**Files**: 5 LocationPickerField copies across collections
**Severity**: High
**Impact**: Any bug fix requires 5 separate changes

### Bug #5: Missing Type Cast Fix (Type Safety)
**File**: Dining.ts line 95
**Severity**: Low
**Impact**: Uses `as any` to hide type errors

---

## 🚀 Quick Wins (Do These First)

All of these can be done in < 1 hour with minimal risk:

### 1. Fix Re-render Bug
**File**: `src/features/data/dining/admin/LocationPickerField.tsx`
**Line**: 153
**Change**: Remove `countries, cities, neighborhoods` from dependency array

### 2. Add locationDisplay Field
**File**: `src/features/data/dining/collections/Dining.ts`
**Lines**: Before 88
**Change**: Copy the locationDisplay field from Accommodations.ts

### 3. Remove Type Cast Hack
**File**: `src/features/data/dining/collections/Dining.ts`
**Line**: 95
**Change**: Remove `as any` from LocationPickerField import

---

## 📊 Data Flow Summary

```
User opens Dining form
    ↓
LocationPickerField component mounts
    ↓
[Effect #1] Fetch all locations from /api/locations
    ↓
[Effect #2] Parse saved location value if editing
    ↓
[Effect #3] Filter cities based on selected country
    ↓
[Effect #4] Filter neighborhoods based on selected city
    ↓
[Effect #5] Update form field with selected location
    ↓
User saves form
    ↓
[beforeChange hook] Auto-generate slug if missing
    ↓
Document saved to database
```

**Location Format**: `"Country|City|Neighborhood"` (pipe-delimited)

Example: `"France|Paris|Marais"`

---

## 🔐 Access Control Summary

```
               Public  User  Editor  Admin
See Published   ✅     ✅    ✅      ✅
See Drafts      ❌     ✅    ✅      ✅
Create          ❌     ❌    ✅      ✅
Edit            ❌     ❌    ❌      ✅
Delete          ❌     ❌    ❌      ✅
Publish         N/A    N/A   N/A     ✅
```

**Key Issue**: Editors can CREATE but NOT EDIT (they're locked out)

---

## 📝 Location Field Details

### What is the Location Field?

The `location` field stores where a dining establishment is located using a **hierarchical, pipe-delimited format**:

```
"France|Paris|Marais"
```

This represents:
- **Country**: France
- **City**: Paris (optional)
- **Neighborhood**: Marais (optional)

### LocationPickerField Component

A **custom Payload CMS form field** that provides cascading dropdowns:

1. **Country dropdown** - Always shown
2. **City dropdown** - Only shown when country selected
3. **Neighborhood dropdown** - Only shown when city selected

### How It Works

```
Fetch all locations (1000+ records)
    ↓
Filter to show only countries (records with no city)
    ↓
User selects country
    ↓
Filter cities for that country
    ↓
User selects city (optional)
    ↓
Filter neighborhoods for that country + city
    ↓
User selects neighborhood (optional)
    ↓
Store pipe-delimited string in location field
```

### All Locations Come From

The Locations collection (`src/features/location/collections/Locations.ts`) is managed by admins via the API or admin UI.

**Important**: `locationKey` values should use the pipe-delimited format (`country|city|neighborhood`).

---

## 🔍 Common Questions

### Q: Why can't editors edit their own items?
**A**: The access control is set to `update: admin only`. This is a design decision that treats editors as "content creators" but not "content editors". Admins must review and edit content.

**Workaround**: Ask an admin to edit, or delete and recreate.

**Better solution**: See VISIBILITY_MATRIX.md for recommended access control changes.

### Q: Why does the location field show old values?
**A**: The `locationDisplay` field syncs on form load but not during editing. The LocationPickerField has its own blue display box that shows the current value.

**Solution**: Remove or properly sync the locationDisplay field.

### Q: Which collections use LocationPickerField?
**A**: All 5 travel data collections have identical (duplicate) copies:
1. Dining
2. Accommodations
3. Attractions
4. Nightlife
5. Affiliate Products

### Q: How do I add a new dining item?
**A**:
1. Open Payload Admin → Dining collection
2. Click "Create New"
3. Fill in: Title, Type, Description, Featured Image
4. In the Location tab, select Country → City (optional) → Neighborhood (optional)
5. Set Status to "Draft" (default)
6. Save
7. Ask admin to publish (change status to "Published")

### Q: Can public users see unpublished items?
**A**: No. The read access control filters to `status: 'published'` for users without authentication.

### Q: What's the pipe character for?
**A**: The `|` character (pipe) separates the location hierarchy. It's chosen because location names usually don't contain pipes.

Example parsing:
```
"France|Paris|Marais".split('|')
→ ["France", "Paris", "Marais"]
```

---

## 🛠️ Recommended Next Steps

### Immediate (This Week)
1. ✅ Read ARCHITECTURE.md to understand the system
2. ✅ Apply all Phase 1 quick wins from REFACTORING_ROADMAP.md
3. ✅ Test all 5 collections work correctly

### Short Term (This Sprint)
1. ✅ Extract shared types and utilities (Phase 2)
2. ✅ Fix editor access control issue
3. ✅ Remove or properly sync locationDisplay field

### Medium Term (Next Sprint)
1. ✅ Consolidate LocationPickerField to shared component (Phase 3)
2. ✅ Add unit tests for location utilities
3. ✅ Document the API for location endpoints

### Long Term (Next Quarter)
1. ✅ Consider collection factory pattern (Phase 4)
2. ✅ Add more travel data collections with same pattern
3. ✅ Refactor admin components to use shared library

---

## 📖 Additional Resources

### Related Files
- **Locations Collection**: `src/features/location/collections/Locations.ts`
- **Other Travel Data**:
  - `src/features/data/accommodations/`
  - `src/features/data/attractions/`
  - `src/features/data/nightlife/`
  - `src/features/data/affiliate/`

### Payload CMS Documentation
- [Custom Fields](https://payloadcms.com/docs/fields/custom/overview)
- [Access Control](https://payloadcms.com/docs/access-control/overview)
- [Hooks](https://payloadcms.com/docs/hooks/overview)

---

## 💡 Key Takeaways

1. **Dining is a template collection** - It's nearly identical to 4 other travel data collections with 95% code duplication

2. **Two major UX issues**:
   - Editors can create but not edit (locked out)
   - Location field shows stale values while editing

3. **Architecture is sound but monolithic** - The 257-line LocationPickerField should be split into smaller, testable modules

4. **Quick wins available** - The Phase 1 fixes from the roadmap can be done in < 1 hour with high value

5. **Refactoring is worth it** - Consolidating LocationPickerField eliminates 4 duplicate 257-line files and makes bug fixes apply everywhere at once

---

## 📞 Questions?

For detailed analysis, see:
- **Data flow & bugs**: ARCHITECTURE.md
- **Access control & visibility**: VISIBILITY_MATRIX.md
- **Refactoring plan**: REFACTORING_ROADMAP.md
