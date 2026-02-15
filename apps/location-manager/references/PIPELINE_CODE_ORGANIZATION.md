# Pipeline Code Organization

## Directory Structure by Pipeline

```
src/features/locations/
├── controllers/                          # API endpoints & orchestration
│   ├── core/                            # Basic location CRUD
│   │   ├── locations.controller.ts
│   │   ├── hierarchy.controller.ts
│   │   ├── maps.controller.ts
│   │   └── types.controller.ts
│   ├── integration/
│   │   └── payload.controller.ts         # ⚡ PAYLOAD SYNC PIPELINE
│   ├── content/
│   │   ├── reviews-pipeline.controller.ts    # 📝 REVIEWS PIPELINE (orchestrator)
│   │   ├── reviews.controller.ts            # Google reviews
│   │   ├── tripadvisor-reviews.controller.ts
│   │   ├── tripadvisor-place.controller.ts
│   │   ├── translate-merge-reviews.controller.ts
│   │   ├── uploads.controller.ts
│   │   ├── instagram.controller.ts
│   │   └── files.controller.ts               # 📦 JSON EXPORT (downloads)
│   └── admin/
│       └── admin.controller.ts
│
├── services/
│   ├── core/
│   │   ├── location-query.service.ts         # Read operations
│   │   └── location-mutation.service.ts      # Write operations
│   └── integrations/
│       ├── payload-sync.service.ts           # ⚡ PAYLOAD SYNC PIPELINE
│       ├── handlers/
│       │   └── media-upload.handler.ts
│       ├── mappers/
│       │   ├── location-payload.mapper.ts    # Transform to Payload schema
│       │   └── (mappers for other collections)
│       ├── resolvers/
│       │   └── payload-location.resolver.ts
│       ├── types/
│       │   └── payload-sync.types.ts
│       ├── uploads.service.ts
│       ├── instagram.service.ts
│       ├── maps.service.ts
│       └── (other integration services)
│
├── repositories/
│   ├── core/
│   │   └── locations.repository.ts           # Database operations
│   └── integration/
│       └── payload-sync.repository.ts        # ⚡ Sync state tracking
│
└── routes/
    └── location.routes.ts                    # All endpoints registered here
```

---

## Pipeline 1: Payload Sync Codebase

**Purpose**: Sync location data to Payload CMS

### Key Files

```
ENTRY POINT
└── routes/location.routes.ts
    └── POST /api/payload/sync/:id → postSyncLocation()
        └── GET /api/payload/sync-status → getSyncStatus()

CONTROLLER (Orchestration)
└── controllers/integration/payload.controller.ts
    └── postSyncLocation(context)
        ├─→ Validates input
        ├─→ Calls PayloadSyncService.syncLocation(id)
        └─→ Returns result + status

SERVICE (Business Logic)
└── services/integrations/payload-sync.service.ts
    ├─→ syncLocation(locationId)
    │   ├─→ Fetch location from DB
    │   ├─→ Check Payload config
    │   ├─→ uploadLocationImages()
    │   ├─→ mapLocationToPayloadFormat()
    │   └─→ upsertPayloadEntry()
    └─→ syncAllLocations(filter)

UTILITIES
├── mappers/
│   └── location-payload.mapper.ts
│       ├─→ mapLocationToPayloadFormat()
│       │   ├─→ Map type → collection
│       │   ├─→ Map fields → tabs
│       │   └─→ Format for Payload schema
│       └─→ mapCategoryToCollection()
│
├── handlers/
│   └── media-upload.handler.ts
│       └─→ uploadLocationImages()
│           ├─→ Upload to Payload media-assets
│           ├─→ Create media-sets
│           ├─→ Create Instagram posts
│           └─→ Return media IDs
│
└── resolvers/
    └── payload-location.resolver.ts
        └─→ resolvePayloadLocationRef()
            ├─→ Auto-resolve missing location refs
            └─→ Update database

TYPES
└── types/payload-sync.types.ts
    ├─→ SyncResult
    ├─→ SyncStatusResponse
    ├─→ PayloadEntryData
    └─→ PayloadSyncState

STATE TRACKING
└── repositories/integration/payload-sync.repository.ts
    ├─→ saveSyncState(locationId, collection, payload_doc_id, status)
    ├─→ getSyncState(locationId, collection)
    ├─→ updateSyncStatus(locationId, collection, status)
    └─→ getAllSyncStates()
```

### Data Flow

```
Location {id: 123, title: "...", type: "restaurant", gallery: [...]}
    ↓
[PayloadSyncService.syncLocation(123)]
    ├─→ uploadLocationImages()
    │   └─→ POST /api/media-assets (Payload)
    │   └─→ POST /api/instagram-posts (Payload)
    ├─→ mapLocationToPayloadFormat()
    │   └─→ {title, tab:Basic Info, tab:Classification, tab:Location & Contact}
    └─→ upsertPayloadEntry()
        └─→ PATCH /api/dining/123 (Payload)
            └─→ Payload CMS {id: "uuid", title: "...", ...}
```

### Key Functions

```typescript
// Entry point
async function postSyncLocation(context: Context): Promise<Response> {
  const { id } = context.req.param();
  const result = await container.payloadSyncService.syncLocation(id);
  return successResponse(result);
}

// Main service
class PayloadSyncService {
  async syncLocation(locationId: number): Promise<SyncResult> {
    const location = this.locationQuery.getLocationById(locationId);
    const uploadedImages = await uploadLocationImages(location, ...);
    const payloadData = mapLocationToPayloadFormat(location, uploadedImages, ...);
    return await this.upsertPayloadEntryWithTypeFallback(...);
  }
}

// Mapping
function mapLocationToPayloadFormat(
  location: Location,
  uploadedImages: UploadedMedia,
  locationRef: string
): PayloadEntryData {
  return {
    title: location.title,
    'tab:Basic Info': {
      type: location.type,
      priceLevel: mapPriceLevel(location),
      gallery: uploadedImages.gallery,
      instagramGallery: uploadedImages.instagram
    },
    'tab:Classification': {
      cuisines: location.cuisines,
      idealFor: location.idealFor
    },
    'tab:Location & Contact': {
      address: location.address,
      phone: location.phoneNumber,
      // ... etc
    }
  };
}
```

---

## Pipeline 2: Reviews Pipeline Codebase

**Purpose**: Fetch, translate, and merge reviews

### Key Files

```
ENTRY POINT (Orchestrator)
└── routes/location.routes.ts
    ├── POST /api/locations/:id/reviews/fetch-pipeline → fetchReviewsPipeline()
    ├── POST /api/locations/:id/reviews/translate-merge → translateAndMergeReviews()
    ├── GET /api/locations/:id/reviews/pipeline-status → getReviewsPipelineStatus()
    └── (+ download endpoints)

PHASE A: FETCH CONTROLLER
└── controllers/content/reviews-pipeline.controller.ts
    ├─→ fetchReviewsPipeline(context)
    │   ├─→ Queue fetch jobs (Google + TripAdvisor)
    │   └─→ Return job IDs + status
    ├─→ getReviewsPipelineStatus(context)
    │   └─→ Check job status + progress
    └─→ downloadReviews(context)
        └─→ Return fetched reviews JSON

PHASE A: FETCH SERVICES
├── ReviewsApiClient (client/shared)
│   └─→ Fetches Google Reviews API
│
├── TripAdvisorReviewsApiClient (client/shared)
│   └─→ Fetches TripAdvisor Reviews API
│
└── TripAdvisorPlaceService (service)
    └─→ Fetches TripAdvisor place data (rating, photos)

PHASE B: MERGE CONTROLLER
└── controllers/content/translate-merge-reviews.controller.ts
    ├─→ translateAndMergeReviews(context)
    │   ├─→ Read raw reviews from storage
    │   ├─→ Merge + translate
    │   └─→ Save merged JSON
    ├─→ downloadMergedReviews(context)
    │   └─→ Return merged reviews
    ├─→ getMergedReviewsStatus(context)
    │   └─→ Return merge stats
    └─→ getMergedReviewsReport(context)
        └─→ Return detailed report

MERGE LOGIC
└── runTranslateAndMergeReviews() [function]
    ├─→ Group reviews by location
    ├─→ Detect language per review
    ├─→ Translate non-English
    ├─→ Deduplicate similar reviews
    ├─→ Calculate quality scores
    ├─→ Filter (accept/reject)
    └─→ Return structured output

TYPES & CONSTANTS
└── controllers/content/
    ├─→ ReviewSource type
    ├─→ PipelineResult interface
    ├─→ FetchReviewsPipelineDto
    └─→ DEFAULT_GOOGLE_PARAMS
        DEFAULT_TRIPADVISOR_LANGUAGES
```

### Data Flow

```
PHASE A: FETCH
Location ID
    ↓
[reviewsApiClient.getReviews()]
    └─→ Google Reviews API
        └─→ RAW Google reviews JSON
            └─→ Store in files/db

[tripAdvisorClient.getReviews()]
    └─→ TripAdvisor API
        └─→ RAW TripAdvisor reviews JSON
            └─→ Store in files/db

PHASE B: MERGE
RAW Google reviews
RAW TripAdvisor reviews
    ↓
[runTranslateAndMergeReviews()]
    ├─→ Combine datasets
    ├─→ Translate to target language
    ├─→ Deduplicate
    ├─→ Score quality
    └─→ Split (accepted + rejected)
    ↓
Output:
├── merged_reviews.json (all accepted)
├── rejects_report.json (filtered reviews)
└── merge_report.json (statistics)
```

### Key Types

```typescript
interface ReviewSource {
  name: 'google' | 'tripadvisor';
  enabled: boolean;
}

interface RawReview {
  review_text?: string;
  rating?: number;
  review_datetime_utc?: string;
  review_photos?: string[];
}

interface MergedReview {
  id: string;
  source: 'google' | 'tripadvisor';
  original_text: string;
  translated_text: string;
  rating: number;
  date: string;
  quality_score: number;
  status: 'accepted' | 'rejected';
}

interface PipelineResult {
  message: string;
  selectedSources: ReviewSource[];
  fetched: { google?: {...}, tripadvisor?: {...} };
  merged?: {...};
  status: 'queued' | 'running' | 'completed' | 'failed';
}
```

---

## Pipeline 3: JSON Export Codebase

**Purpose**: Export location data in different formats

### Key Files

```
ENTRY POINT
└── routes/location.routes.ts
    ├── GET /api/locations/:id/export → downloadLocationExport()
    └── GET /api/locations/:id/ai-json/download → downloadAiJson()

CONTROLLERS
└── controllers/content/files.controller.ts
    ├─→ downloadLocationExport(context)
    │   ├─→ Fetch location from DB
    │   ├─→ Fetch TripAdvisor data
    │   ├─→ Format as JSON
    │   └─→ Return with proper headers
    └─→ downloadAiJson(context)
        ├─→ Fetch location + enrichment
        ├─→ Fetch reviews (optional)
        ├─→ Format with metadata
        ├─→ Calculate quality metrics
        └─→ Return with proper headers

SERVICES (Used)
├── LocationQueryService
│   └─→ getLocationById()
│
└── TripAdvisorPlaceService
    └─→ getTripAdvisorData()
```

### Data Flow

```
GET /api/locations/123/export
    ↓
[downloadLocationExport()]
    ├─→ SELECT * FROM locations WHERE id=123
    ├─→ SELECT * FROM tripadvisor WHERE location_id=123
    └─→ Format as JSON
        └─→ HTTP 200 {location, enrichment, media, ...}

GET /api/locations/123/ai-json/download
    ↓
[downloadAiJson()]
    ├─→ SELECT * FROM locations WHERE id=123
    ├─→ SELECT * FROM tripadvisor WHERE location_id=123
    ├─→ SELECT * FROM reviews WHERE location_id=123 (optional)
    ├─→ Calculate quality metrics
    └─→ Format as AI-optimized JSON
        └─→ HTTP 200 {metadata, location, contact, enrichment, quality, ...}
```

### Output Functions

```typescript
// Location Export
function formatLocationExport(
  location: Location,
  tripAdvisorData: TripAdvisorPlace
): LocationExportJSON {
  return {
    id: location.id,
    title: location.title,
    type: location.type,
    address: location.address,
    coordinates: {lat: location.latitude, lng: location.longitude},
    contact: {
      phone: location.phoneNumber,
      website: location.website,
      email: location.email
    },
    media: {
      gallery: location.gallery.map(...),
      instagram: location.instagramGallery.map(...)
    },
    enrichment: {
      tripadvisor: {
        rating: tripAdvisorData.rating,
        review_count: tripAdvisorData.reviewCount
      }
    }
  };
}

// AI Export
function formatAiJson(
  location: Location,
  enrichment: EnrichedData,
  qualityMetrics: QualityMetrics
): AiJsonExport {
  return {
    metadata: {
      id: location.id,
      export_timestamp: new Date().toISOString(),
      version: "1.0"
    },
    location: {
      name: location.title,
      type: location.type,
      hierarchy: {country: location.country, city: location.city},
      coordinates: {lat: location.latitude, lng: location.longitude},
      timezone: location.ianaTimeId
    },
    classification: {
      cuisines: location.cuisines,
      attributes: location.idealFor
    },
    enrichment: {
      google_reviews: enrichment.google,
      tripadvisor: enrichment.tripadvisor
    },
    quality_metrics: qualityMetrics
  };
}
```

---

## Service Container (Dependency Injection)

```typescript
class ServiceContainer {
  // External APIs
  readonly payloadApi: PayloadApiClient;
  readonly instagramApi: InstagramApiClient;

  // Services (singletons)
  readonly payloadSyncService: PayloadSyncService;
  readonly mapsService: MapsService;
  readonly instagramService: InstagramService;
  readonly uploadsService: UploadsService;
  readonly locationQueryService: LocationQueryService;
  readonly locationMutationService: LocationMutationService;

  getInstance(): ServiceContainer { /* singleton */ }
}
```

Used in controllers:
```typescript
const container = ServiceContainer.getInstance();
const result = await container.payloadSyncService.syncLocation(id);
```

---

## Summary: Code Organization by Pipeline

| Aspect | Payload Sync | Reviews | JSON Export |
|--------|--------------|---------|------------|
| **Main Controller** | `payload.controller.ts` | `reviews-pipeline.controller.ts` | `files.controller.ts` |
| **Main Service** | `PayloadSyncService` | Multiple clients + merge logic | Query service |
| **Mappers** | `location-payload.mapper.ts` | `runTranslateAndMergeReviews()` | Inline formatters |
| **State** | `payload-sync.repository.ts` | Pipeline job tracking | No state |
| **Handlers** | `media-upload.handler.ts` | Review translation | Pure functions |
| **Types** | `payload-sync.types.ts` | Various types in controller | Inline interfaces |
| **External APIs** | `PayloadApiClient` | `ReviewsApiClient`, `TripAdvisorClient` | None (pure read) |

---

## File Dependencies

```
Location Routes (location.routes.ts)
├── payload.controller.ts
│   └── PayloadSyncService
│       ├── uploadLocationImages()
│       ├── mapLocationToPayloadFormat()
│       ├── PayloadApiClient
│       └── LocationQueryService
│
├── reviews-pipeline.controller.ts
│   ├── ReviewsApiClient
│   ├── TripAdvisorReviewsApiClient
│   ├── runTranslateAndMergeReviews()
│   └── TripAdvisorPlaceService
│
└── files.controller.ts
    ├── LocationQueryService
    └── TripAdvisorPlaceService
```

---

## Key Principle: Separation of Concerns

✅ **Each pipeline has:**
- Dedicated controller(s)
- Dedicated service(s)
- Clear input/output types
- Error handling
- State tracking (if needed)

✅ **No mixing:**
- Payload logic doesn't touch reviews
- Reviews logic doesn't touch exports
- Exports are pure reads

✅ **Shared infrastructure:**
- LocationQueryService (for reading)
- ServiceContainer (dependency injection)
- ErrorHandling (shared middleware)
