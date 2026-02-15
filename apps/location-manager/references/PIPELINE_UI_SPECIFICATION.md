# Pipeline UI Specification

## Overview

During location creation/editing, show **three separate pipeline status tabs** that each have their own checklist. Each checklist shows what's required, what's complete, and what's missing.

```
┌─────────────────────────────────────────────────────────────────┐
│  Location Editor: "Restaurant Name"                             │
├──────┬──────────────┬──────────────┬────────────────────────────┤
│ Core │ Payload Sync │ Reviews      │ JSON Export                │
├──────┴──────────────┴──────────────┴────────────────────────────┤
│                                                                  │
│  [Checklist for selected tab]                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 1: Payload Sync Checklist

**Purpose**: Show what's needed to sync this location to Payload CMS

### Status Overview (Header)

```
┌─────────────────────────────────────────┐
│ Payload Sync Status                     │
├─────────────────────────────────────────┤
│ Completion: [████████░░] 80%            │
│ Last synced: 2024-02-14 18:30           │
│ Status: ✅ Ready to sync                │
│ Target Collection: 🍽️ Dining            │
└─────────────────────────────────────────┘
```

### Checklist Items

```
BASIC INFORMATION
✅ Title                          "Restaurant Name" (required)
✅ Type                           "Restaurant" (required)
⚠️  Price Level                   Not set (optional but recommended)

VISUALS
✅ Gallery Images                 4 images (at least 1 required)
✅ Instagram Gallery              2 posts (optional)

CLASSIFICATION
✅ Cuisines                       ["Peruvian", "Seafood"] (optional)
✅ Ideal For Tags                 ["Romantic", "Casual"] (optional)

LOCATION & CONTACT
✅ Location Hierarchy             Peru > Lima > Miraflores (required)
✅ Address                        "Calle Principal 123" (required)
✅ Coordinates                    -12.0464, -77.0428 (required)
✅ Phone Number                   "+51 1 234 5678" (optional)
✅ Website                        "https://restaurant.com" (optional)
✅ Email                          "info@restaurant.com" (optional)
✅ Hours of Operation             Mon-Sun 12-11pm (optional)
✅ Timezone                       "America/Lima" (optional)

PAYLOAD INTEGRATION
✅ Location Ref Resolved          "uuid-1234..." (auto-resolved)
⏳ Last Sync Status               Queued for sync...

ACTION BUTTONS
[🔄 Sync Now]  [View in Payload]  [Test Connection]
```

### Data Requirements

```typescript
interface PayloadSyncChecklist {
  // Overview
  completionPercent: number;        // 0-100
  lastSyncedAt: Date | null;
  syncStatus: 'ready' | 'pending' | 'syncing' | 'success' | 'error';
  targetCollection: 'dining' | 'accommodations' | 'attractions' | 'nightlife';
  errorMessage?: string;

  // Items with status
  items: {
    name: string;
    value: string | null;
    required: boolean;
    status: 'complete' | 'missing' | 'invalid';
    recommended?: boolean;
  }[];

  // Actions
  canSync: boolean;
  missingRequired: string[];  // ["Title", "Location Hierarchy"]
  warnings: string[];         // ["Price level not set (recommended)"]
}
```

### Color Coding

- ✅ **Green**: Complete
- ⚠️ **Orange**: Missing optional/recommended field
- ❌ **Red**: Missing required field
- ⏳ **Gray**: Processing

---

## Tab 2: Reviews Checklist

**Purpose**: Show reviews fetch status and statistics

### Status Overview (Header)

```
┌─────────────────────────────────────────────────────────────┐
│ Reviews Pipeline Status                                     │
├─────────────────────────────────────────────────────────────┤
│ Overall: [████████░░] 65%                                   │
│                                                             │
│ Google Reviews:      ✅ Complete (47 reviews)              │
│ TripAdvisor Reviews: ⏳ Fetching... (23/150 reviews)        │
│ TripAdvisor Place:   ✅ Complete (4.5★ rating)             │
│ Merged & Translated: ❌ Not started                         │
└─────────────────────────────────────────────────────────────┘
```

### Detailed Pipeline Steps

```
STEP 1: FETCH REVIEWS
┌─────────────────────────────────────────┐
│ Google Reviews                          │
├─────────────────────────────────────────┤
│ Status: ✅ Complete                     │
│ Fetched: 47 reviews                     │
│ Avg Rating: 4.2★ (from 47 reviews)      │
│ Language: Mixed (EN: 32, ES: 15)        │
│ Fetched at: 2024-02-14 10:30            │
│                                         │
│ [🔄 Re-fetch]  [View Raw Data]          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ TripAdvisor Reviews                     │
├─────────────────────────────────────────┤
│ Status: ⏳ In Progress                   │
│ Progress: [████░░░░░░] 40%              │
│ Fetched: 60/150 reviews                 │
│ Languages: EN (50), ES (10)             │
│ ETA: ~2 minutes                         │
│                                         │
│ [⏸ Pause]  [Cancel]  [View Progress]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ TripAdvisor Place Data                  │
├─────────────────────────────────────────┤
│ Status: ✅ Complete                     │
│ Rating: 4.5★ (from 250 reviews)         │
│ Review Count: 250                       │
│ Ranking: #5 on TripAdvisor              │
│ Photos: 42 images                       │
│                                         │
│ [View Place Page]                       │
└─────────────────────────────────────────┘
```

### Step 2: Merge & Translate

```
STEP 2: TRANSLATE & MERGE REVIEWS
┌─────────────────────────────────────────────────────────┐
│ Status: ⏳ Ready to Merge (Waiting for TripAdvisor)    │
│                                                        │
│ Once all sources are fetched:                          │
│ - Translate non-English to target language             │
│ - Deduplicate similar reviews                          │
│ - Calculate quality scores                             │
│ - Generate statistics                                  │
│                                                        │
│ [Start Merge] (will run after fetch completes)         │
└─────────────────────────────────────────────────────────┘

OR (if ready):

┌─────────────────────────────────────────────────────────┐
│ Status: ✅ Merge Complete                              │
├─────────────────────────────────────────────────────────┤
│ Total Reviews Fetched: 107                             │
│ After Deduplication: 95                                │
│ Accepted Reviews: 88                                   │
│ Rejected Reviews: 7                                    │
│ Quality Threshold: 0.70 (confidence)                   │
│                                                        │
│ Languages:                                             │
│   - English: 60 reviews (100%)                         │
│   - Translated from Spanish: 25 reviews                │
│   - Translated from French: 3 reviews                  │
│                                                        │
│ Top Issues Found:                                      │
│   - Slow service: 12 mentions                          │
│   - Great food: 18 mentions                            │
│   - Expensive: 8 mentions                              │
│                                                        │
│ [View Merged Reviews] [View Rejects] [Download Report] │
└─────────────────────────────────────────────────────────┘
```

### Data Requirements

```typescript
interface ReviewsChecklist {
  // Overview
  completionPercent: number;  // 0-100 based on fetch + merge progress

  // Fetch status per source
  google: {
    status: 'not_started' | 'fetching' | 'complete' | 'error';
    reviewCount: number;
    avgRating: number;
    languages: Record<string, number>;  // {EN: 32, ES: 15}
    fetchedAt?: Date;
    error?: string;
  };

  tripadvisor_reviews: {
    status: 'not_started' | 'fetching' | 'complete' | 'error';
    reviewCount: number;
    targetCount: number;  // for progress
    progress: number;     // 0-100
    languages: Record<string, number>;
    eta?: string;
    error?: string;
  };

  tripadvisor_place: {
    status: 'not_started' | 'fetching' | 'complete' | 'error';
    rating: number;
    reviewCount: number;
    ranking?: number;
    photoCount: number;
    error?: string;
  };

  // Merge status
  merge: {
    status: 'not_started' | 'ready_to_start' | 'merging' | 'complete' | 'error';
    stats?: {
      totalFetched: number;
      afterDedup: number;
      accepted: number;
      rejected: number;
      qualityThreshold: number;
      languagesTranslated: Record<string, number>;
      topKeywords: Array<{keyword: string; count: number}>;
    };
    error?: string;
  };

  // Actions
  canStartMerge: boolean;
  canRetryFetch: boolean;
}
```

### Timeline View (Alternative)

```
REVIEWS PIPELINE TIMELINE
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Fetch Google ──→ [✅ 47]                           │
│  Fetch TripAdvisor ──→ [⏳ 60/150]                   │
│  Fetch Place Data ──→ [✅ 4.5★]                     │
│          │                                          │
│          └─→ Merge & Translate ──→ [⏳ Ready]       │
│              │                                      │
│              └─→ Generate Report ──→ [❌ Waiting]   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Tab 3: JSON Export Checklist

**Purpose**: Show data schema coverage and what's available for export

### Status Overview (Header)

```
┌─────────────────────────────────────────────────────────┐
│ JSON Export Schema Coverage                            │
├─────────────────────────────────────────────────────────┤
│ Location Export:  [████████░░] 85% complete            │
│ AI JSON Export:   [██████░░░░] 60% complete            │
│                                                        │
│ Ready to export:                                       │
│ [📥 Download Location JSON]  [📥 Download AI JSON]   │
└─────────────────────────────────────────────────────────┘
```

### Location Export Schema

```
LOCATION EXPORT SCHEMA
(Flat JSON for Frontend/Client)

✅ METADATA
   ├─ id: 1
   ├─ title: "Restaurant Name"
   └─ export_timestamp: "2024-02-14T18:00:00Z"

✅ LOCATION INFORMATION
   ├─ type: "restaurant"
   ├─ hierarchy:
   │  ├─ country: "Peru" ✅
   │  ├─ city: "Lima" ✅
   │  └─ neighborhood: "Miraflores" ✅
   └─ coordinates:
      ├─ latitude: -12.0464 ✅
      └─ longitude: -77.0428 ✅

✅ CONTACT INFORMATION
   ├─ address: "Calle Principal 123" ✅
   ├─ phone: "+51 1 234 5678" ✅
   ├─ website: "https://restaurant.com" ✅
   ├─ email: "info@restaurant.com" ✅
   ├─ hours: {...} ✅
   └─ timezone: "America/Lima" ✅

✅ MEDIA
   ├─ gallery: 4 images ✅
   └─ instagram: 2 posts ✅

✅ CLASSIFICATION
   ├─ cuisines: ["Peruvian", "Seafood"] ✅
   └─ idealFor: ["Romantic", "Casual"] ✅

⚠️ ENRICHMENT
   └─ tripadvisor:
      ├─ rating: 4.5 ✅
      ├─ review_count: 250 ✅
      └─ photos: 42 ✅

[📥 Download Location JSON] [Preview Schema]
```

### AI JSON Export Schema

```
AI JSON EXPORT SCHEMA
(Full enrichment for ML/AI models)

✅ METADATA
   ├─ export_timestamp ✅
   ├─ version: "1.0" ✅
   └─ data_quality_score: 0.85 ✅

✅ CORE LOCATION DATA
   ├─ name ✅
   ├─ type ✅
   ├─ hierarchy ✅
   └─ coordinates ✅

✅ CONTACT INFORMATION
   ├─ address ✅
   ├─ phone ✅
   ├─ website ✅
   ├─ email ✅
   ├─ hours ✅
   └─ timezone ✅

✅ MEDIA ASSETS
   ├─ primary_image ✅
   ├─ gallery (4 items) ✅
   └─ instagram (2 items) ✅

✅ CLASSIFICATION
   ├─ primary_type ✅
   ├─ cuisines ✅
   └─ attributes ✅

✅ GOOGLE REVIEWS ENRICHMENT
   ├─ avg_rating: 4.2 ✅
   ├─ review_count: 47 ✅
   ├─ top_keywords ✅
   └─ sample_reviews (5) ✅

✅ TRIPADVISOR ENRICHMENT
   ├─ avg_rating: 4.5 ✅
   ├─ review_count: 250 ✅
   ├─ ranking: #5 ✅
   ├─ photos: 42 ✅
   └─ place_details ✅

⚠️ MERGED REVIEWS (Optional)
   ├─ merged_reviews: 88 ✅
   ├─ rejected_reviews: 7 ⚠️ (See Reviews tab)
   └─ quality_metrics ✅

✅ QUALITY METRICS
   ├─ data_completeness: 0.92 ✅
   ├─ image_coverage: 0.88 ✅
   └─ review_coverage: 0.85 ✅

[📥 Download AI JSON] [Preview Schema]
```

### Comparison Table

```
EXPORT FORMAT COMPARISON

                  Location Export    AI JSON Export
────────────────────────────────────────────────────
Core Data         ✅ Complete        ✅ Complete
Media             ✅ Complete        ✅ Complete
Classification    ✅ Complete        ✅ Complete
Google Reviews    ❌ Not Included    ✅ Included (47)
TA Reviews        ✅ Rating only     ✅ Full enrichment
TA Place Data     ✅ Included        ✅ Included
Merged Reviews    ❌ Not Included    ⚠️ Optional
Quality Metrics   ❌ Not Included    ✅ Included
File Size         ~45 KB             ~150 KB
Use Case          Frontend/Client    ML/AI Models
────────────────────────────────────────────────────
```

### Data Requirements

```typescript
interface JsonExportChecklist {
  // Location export
  location_export: {
    completionPercent: number;
    sections: {
      name: string;
      fields: {
        name: string;
        value: any;
        included: boolean;
        required: boolean;
      }[];
    }[];
    canExport: boolean;
    fileSize: string;
  };

  // AI JSON export
  ai_json_export: {
    completionPercent: number;
    sections: {
      name: string;
      fields: {
        name: string;
        value: any;
        included: boolean;
        required: boolean;
        source?: 'location' | 'google_reviews' | 'tripadvisor' | 'merged_reviews';
      }[];
    }[];
    canExport: boolean;
    fileSize: string;
    qualityScore: number;
  };
}
```

---

## Component Structure

### React/Vue Component Hierarchy

```
<LocationEditor>
  <TabBar>
    <Tab label="Core" />
    <Tab label="Payload Sync" />
    <Tab label="Reviews" />
    <Tab label="JSON Export" />
  </TabBar>

  {selectedTab === 'payload_sync' && (
    <PayloadSyncChecklist
      location={location}
      syncStatus={syncStatus}
      onSync={handleSync}
      onRetry={handleRetry}
    />
  )}

  {selectedTab === 'reviews' && (
    <ReviewsChecklist
      location={location}
      fetchStatus={fetchStatus}
      mergeStatus={mergeStatus}
      onFetch={handleFetch}
      onMerge={handleMerge}
    />
  )}

  {selectedTab === 'json_export' && (
    <JsonExportChecklist
      location={location}
      exportStatus={exportStatus}
      onDownload={handleDownload}
    />
  )}
</LocationEditor>
```

### Data Flow

```
Location Editor UI
    ↓
[Fetch pipeline statuses in real-time]
    ├─→ PayloadSyncService.getStatus(locationId)
    ├─→ ReviewsService.getStatus(locationId)
    └─→ JsonExportService.getSchema(locationId)
    ↓
[Update checklists with current data]
    ├─→ PayloadSyncChecklist re-renders
    ├─→ ReviewsChecklist re-renders
    └─→ JsonExportChecklist re-renders
    ↓
[User takes action: Sync, Fetch, Download]
    ├─→ Trigger pipeline (async, show progress)
    └─→ Update status in real-time
```

---

## API Endpoints Needed (Backend)

To support this UI, you'll need endpoints that return checklist data:

```typescript
// Payload Sync Status
GET /api/locations/:id/payload-sync/checklist
Response: PayloadSyncChecklist

// Reviews Status
GET /api/locations/:id/reviews/checklist
Response: ReviewsChecklist

// JSON Export Schema
GET /api/locations/:id/json-export/checklist
Response: JsonExportChecklist

// Optional: Get all pipeline status in one call
GET /api/locations/:id/pipelines/status
Response: {
  payload_sync: PayloadSyncChecklist,
  reviews: ReviewsChecklist,
  json_export: JsonExportChecklist
}
```

---

## Status Icons & Colors

```
Status Code  Icon  Color    Meaning
──────────────────────────────────────────
complete     ✅    Green    All required fields present
missing      ❌    Red      Required field missing
optional     ⚠️    Orange   Optional field not filled
progress     ⏳    Blue     In progress
error        ⚠️    Red      Error occurred
not_started  ⭕    Gray     Not started yet
warning      ⚠️    Orange   Warning (recommended field)
```

---

## Example: Real-time Updates

When user initiates a sync:

```
1. User clicks [🔄 Sync Now]
   ↓
2. Status changes: ⏳ Syncing...
3. Progress indicator appears: [████░░░░░░] 40%
4. Items turn gray as they're being processed
   ↓
5. Sync completes
   ↓
6. Status changes: ✅ Synced (2024-02-14 18:35)
7. Items turn green
8. "Last synced" timestamp updates
```

---

## Mobile Responsiveness

On mobile, tabs could be:
- Horizontal scrollable tabs
- Or collapsible sections instead of tabs
- Show critical items first (required fields)
- Hide optional fields by default

```
MOBILE VIEW
┌──────────────────┐
│ Payload Sync ✅ │
├──────────────────┤
│ ▼ Required (4)   │
│  ✅ Title        │
│  ✅ Type         │
│  ✅ Address      │
│  ✅ Coordinates  │
│                  │
│ ▼ Optional (5)   │
│  ⚠️ Price Level  │
│  ✅ Website      │
│  ... more        │
└──────────────────┘
```

