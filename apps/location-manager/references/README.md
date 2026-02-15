# Location Manager: Export Pipelines & Status UI

## 📚 Documentation Suite

This directory contains comprehensive documentation for the Location Manager's three export pipelines and the proposed unified status UI.

### Quick Navigation

1. **[EXPORT_PIPELINES.md](./EXPORT_PIPELINES.md)** ⭐ START HERE
   - Complete architecture breakdown
   - Data flows for each pipeline
   - Service organization
   - Error handling & recovery

2. **[PIPELINE_QUICK_REFERENCE.md](./PIPELINE_QUICK_REFERENCE.md)** 🚀 QUICK LOOKUP
   - At-a-glance pipeline comparison
   - Common tasks with examples
   - Mobile-friendly overview
   - Configuration guide

3. **[PIPELINE_CODE_ORGANIZATION.md](./PIPELINE_CODE_ORGANIZATION.md)** 💻 CODE STRUCTURE
   - File organization by pipeline
   - Dependency injection setup
   - Key functions & interfaces
   - Service architecture

4. **[PIPELINE_UI_SPECIFICATION.md](./PIPELINE_UI_SPECIFICATION.md)** 🎨 UI/UX DESIGN
   - Three-tab checklist interface
   - Component structure & data flow
   - Real-time status updates
   - Mobile responsive design

5. **[PIPELINE_API_SPECIFICATION.md](./PIPELINE_API_SPECIFICATION.md)** 🔌 BACKEND API
   - Endpoints for checklist data
   - Request/response formats
   - Real-time WebSocket updates
   - Error handling

---

## The Problem You're Solving

**Before**:
- One master location document that feeds three different pipelines
- Unclear which fields go where
- No clear UI showing readiness for each export type
- Only Payload Sync had a status checklist

**After**:
- Clear separation of three pipelines with their own checklists
- Each checklist shows exactly what's needed and what's missing
- Real-time progress indicators during fetch/sync operations
- Users understand exactly what data each export pipeline requires

---

## The Three Pipelines (Simplified)

### 🔄 Pipeline 1: Payload Sync
**What**: Sync location data to Questura CMS (dining, accommodations, attractions, nightlife)
**When**: Manual or batch sync
**Checklist shows**: Required fields for Payload, what's complete, what's missing
**Example**: "Title ✅, Price Level ⚠️ (recommended)"

### 📝 Pipeline 2: Reviews
**What**: Fetch & merge reviews from Google and TripAdvisor
**When**: Long-running async operation
**Checklist shows**: Fetch progress (Google, TA reviews, TA place) + merge statistics
**Example**: "Google Reviews ✅ (47), TA Reviews ⏳ 40%"

### 📦 Pipeline 3: JSON Export
**What**: Export location data in different JSON formats
**When**: On-demand via download
**Checklist shows**: Schema coverage for both formats (Location JSON, AI JSON)
**Example**: "Location Export ✅ 85%, AI JSON ✅ 60%"

---

## UI Architecture: Three Tabs

```
┌─────────────────────────────────────────────────┐
│ Location Editor: "Restaurant Name"              │
├──────┬──────────────┬──────────────┬────────────┤
│ Core │ Payload Sync │ Reviews      │ JSON Export│
├──────┴──────────────┴──────────────┴────────────┤
│                                                 │
│  TAB CONTENT (Dynamic based on selection)      │
│  - Checklist of items                          │
│  - Status indicators                           │
│  - Progress bars (if applicable)                │
│  - Action buttons                              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Tab 1: Payload Sync
Shows what fields are needed to sync to Payload CMS with a completion percentage.

**Example**:
```
Payload Sync Status [████████░░] 80%
✅ Title
✅ Type
⚠️ Price Level (recommended)
✅ Gallery (4 images)
✅ Address
[🔄 Sync Now]
```

### Tab 2: Reviews
Shows progress of fetching reviews from multiple sources and merging them.

**Example**:
```
Reviews Pipeline Status
✅ Google Reviews (47 fetched)
⏳ TripAdvisor Reviews [████░░░░░] 40%
✅ TripAdvisor Place (4.5★)
⏳ Merge & Translate (ready when TA completes)

[Start Merge] [View Progress]
```

### Tab 3: JSON Export
Shows what data is available for export and schema coverage.

**Example**:
```
JSON Export Schema Coverage
Location Export: [████████░░] 85%
AI JSON Export: [██████░░░░] 60%

[📥 Download Location JSON] [📥 Download AI JSON]
```

---

## Key Concepts

### 1. Master Location Document

During creation/editing, data flows in from:
- User input (title, type, address)
- Google Maps API (place ID, coordinates, hours)
- Media upload (gallery, Instagram)
- Reviews APIs (Google, TripAdvisor)

This single document is the source of truth for ALL three pipelines.

### 2. Pipeline-Specific Transformations

Each pipeline transforms the master document differently:

```
Master Location Document
    ├─→ Payload Sync: Extract & format for Payload CMS schema
    ├─→ Reviews: Fetch external data, translate, merge
    └─→ JSON Export: Serialize for different formats
```

### 3. Idempotency

- **Payload Sync**: Idempotent (can run multiple times safely)
- **Reviews**: Non-idempotent (appends new reviews, deduplicates)
- **JSON Export**: Pure reads (always consistent)

---

## Implementation Roadmap

### Phase 1: Architecture Documentation ✅
- [x] Identify three pipelines
- [x] Map data flows
- [x] Document services & controllers
- [x] Create quick reference

### Phase 2: UI Specification ✅
- [x] Design three-tab interface
- [x] Define checklist structure
- [x] Component hierarchy
- [x] Real-time update strategy

### Phase 3: Backend API
- [ ] Create `/api/locations/:id/payload-sync/checklist`
- [ ] Create `/api/locations/:id/reviews/checklist`
- [ ] Create `/api/locations/:id/json-export/checklist`
- [ ] Add WebSocket for real-time updates

### Phase 4: Frontend Implementation
- [ ] Create TabBar component with three tabs
- [ ] Implement PayloadSyncChecklist component
- [ ] Implement ReviewsChecklist component
- [ ] Implement JsonExportChecklist component
- [ ] Add real-time status polling/WebSocket

### Phase 5: Testing & Polish
- [ ] Unit tests for checklist calculations
- [ ] E2E tests for pipeline workflows
- [ ] Performance optimization
- [ ] Mobile responsiveness

---

## FAQ

### Q: Why three separate tabs instead of one view?
**A**: Each pipeline has different purposes, different data sources, and different user concerns. Separating them makes it clear what's needed for each export.

### Q: Can I trigger all pipelines at once?
**A**: Payload Sync and JSON Export can run anytime. Reviews should run first (takes longer). Then you can optionally include reviews in the AI JSON export.

### Q: What happens to reviews data?
**A**: Reviews stay in the Location Manager. They're NOT synced to Payload CMS. You can download them as JSON or include them in the AI JSON export.

### Q: How often should I fetch reviews?
**A**: As needed. Recommended weekly or monthly. Set based on your content update frequency.

### Q: What if Payload CMS connection fails?
**A**: Payload Sync will show an error. Click [Retry] to try again. No data is lost.

### Q: Can I export without completing all three pipelines?
**A**: Yes! Each export is independent:
- Payload Sync is optional (but required to show in Questura)
- Reviews are optional (JSON export works without them)
- JSON export works anytime (even if other pipelines incomplete)

---

## Glossary

| Term | Meaning |
|------|---------|
| **Payload Sync** | Process of syncing location data to Questura CMS |
| **Reviews Pipeline** | Process of fetching & merging reviews from external sources |
| **JSON Export** | Process of exporting location data in JSON format |
| **Master Document** | The location record in Location Manager database |
| **Checklist** | UI showing completeness of a pipeline's requirements |
| **Schema Coverage** | Percentage of JSON export fields populated with data |
| **Deduplication** | Removing duplicate reviews from merged data |

---

## Related Files

- **Backend**: `src/features/locations/services/integrations/`
- **Controllers**: `src/features/locations/controllers/`
- **Routes**: `src/features/locations/routes/location.routes.ts`
- **Payload Types**: `src/features/locations/services/integrations/types/payload-sync.types.ts`

---

## Getting Help

### To understand the architecture:
→ Read [EXPORT_PIPELINES.md](./EXPORT_PIPELINES.md)

### To understand what each pipeline does:
→ Read [PIPELINE_QUICK_REFERENCE.md](./PIPELINE_QUICK_REFERENCE.md)

### To understand the code structure:
→ Read [PIPELINE_CODE_ORGANIZATION.md](./PIPELINE_CODE_ORGANIZATION.md)

### To design the UI:
→ Read [PIPELINE_UI_SPECIFICATION.md](./PIPELINE_UI_SPECIFICATION.md)

### To implement the backend:
→ Read [PIPELINE_API_SPECIFICATION.md](./PIPELINE_API_SPECIFICATION.md)

---

## Key Takeaway

You now have a **clear, separated view of what happens at each stage**:

1. **Creation/Editing** collects data into one master document
2. **Three independent pipelines** each transform that data for their purpose
3. **Three checklists** show users exactly what's ready and what's missing
4. **Clear UI** eliminates confusion about what goes where

Users will know:
- "I need these fields for Payload" (Checklist 1)
- "I need to fetch reviews" (Checklist 2)
- "This is what I can export and how much is ready" (Checklist 3)

---

## Version History

- **v1.0** (2024-02-14): Initial documentation suite created
  - Architecture overview
  - UI specification with three tabs
  - Backend API specification
  - Quick reference guide
