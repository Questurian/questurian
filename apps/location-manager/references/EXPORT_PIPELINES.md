# Location Manager Export Pipelines Architecture

## Overview

The Location Manager serves three distinct export pipelines that operate on the master location document. Each pipeline has its own data transformations, API integrations, and outputs.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MASTER LOCATION DOCUMENT                     │
│  (location + coordinates + type + media + reviews + tripadvisor)│
└─────────┬───────────────────────┬────────────────┬──────────────┘
          │                       │                │
          ▼                       ▼                ▼
    ┌─────────────┐         ┌──────────┐    ┌──────────────┐
    │   PAYLOAD   │         │ REVIEWS  │    │ JSON EXPORT  │
    │    SYNC     │         │ PIPELINE │    │  PIPELINE    │
    │  PIPELINE   │         └──────────┘    └──────────────┘
    └─────────────┘
```

---

## Pipeline 1: Payload Sync Pipeline

**Purpose**: Sync dining, accommodations, attractions, and nightlife data to the Questura backend (Payload CMS).

### Data Flow

```
Location Document (ID, type, galleries, cuisines, idealFor)
  ↓
[PayloadSyncService]
  ├─→ Upload images & create media-sets in Payload
  ├─→ Upload Instagram posts in Payload
  ├─→ Map location to Payload format
  └─→ Upsert collection entry (dining/accommodations/attractions/nightlife)
  ↓
Payload CMS Collection
  └─→ Data available in Questura frontend
```

### Input Document Structure

```typescript
{
  id: number
  title: string
  type: 'restaurant' | 'hotel' | 'museum' | 'bar' // mapped to collection
  gallery: [{ image, caption, altText }]
  instagramGallery: [{ post, embedCode }]
  cuisines: string[] // for dining
  idealFor: string[] // tags
  address: string
  phoneNumber: string
  website: string
  email: string
  countryCode: string
  operationHours: object
  ianaTimeId: string
  latitude: number
  longitude: number
}
```

### Output Format (Payload CMS)

**For Dining** (`/api/dining`):
```json
{
  "title": "Restaurant Name",
  "tab:Basic Info": {
    "type": "restaurant",
    "priceLevel": "2",
    "gallery": [...media-sets...],
    "instagramGallery": [...instagram-posts...]
  },
  "tab:Classification": {
    "cuisines": ["Peruvian", "Ceviche"],
    "idealFor": ["Romantic", "Casual"]
  },
  "tab:Location & Contact": {
    "location": "Lima, Peru",
    "locationRef": "...",
    "address": "...",
    "phoneNumber": "...",
    "website": "...",
    "email": "...",
    "operationHours": {...},
    "ianaTimeId": "America/Lima",
    "latitude": -12.0464,
    "longitude": -77.0428
  }
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/payload/sync/:id` | POST | Sync single location to Payload |
| `/api/payload/sync-all` | POST | Sync all locations to Payload |
| `/api/payload/sync-status` | GET | Get sync status for all locations |
| `/api/payload/sync-status/:id` | GET | Get sync status for specific location |
| `/api/payload/test-connection` | GET | Test Payload CMS connection |

### Key Services & Modules

- **PayloadSyncService**: Main orchestrator
  - `syncLocation(locationId)` - Sync single location
  - `syncAllLocations(filter)` - Batch sync with filters

- **mapLocationToPayloadFormat()**: Transform location to Payload schema
  - Maps location type to collection (dining/accommodations/etc)
  - Maps fields to correct tabs
  - Handles media uploads

- **uploadLocationImages()**: Media asset management
  - Creates media-sets
  - Creates Instagram posts
  - Returns media IDs for reference

- **PayloadLocationResolver**: Auto-resolves missing location references

---

## Pipeline 2: Reviews Pipeline

**Purpose**: Fetch, translate, and merge reviews from Google & TripAdvisor for enrichment.

### Data Flow

```
Location ID
  ↓
[Reviews Fetch]
  ├─→ Google Reviews API → RAW Google reviews
  └─→ TripAdvisor Reviews API → RAW TripAdvisor reviews
  ↓
[Translate & Merge]
  ├─→ Translate non-English reviews
  ├─→ Deduplicate & merge
  └─→ Generate quality metrics
  ↓
Merged Reviews JSON
  ├─→ Store locally (files/database)
  └─→ Available for download/consumption
```

### Phase 1: Fetch

**Google Reviews** → `/api/locations/:id/reviews/fetch-pipeline`
```typescript
{
  business_id: string        // from maps
  limit: number              // default 99
  translate_reviews: true    // translate to English
  sort_by: 'newest'         // sort order
  region: 'pe'              // region for localization
}
```

**TripAdvisor Reviews** → `/api/locations/:id/tripadvisor-reviews/fetch`
```typescript
{
  location_id: string         // TripAdvisor ID
  languages: ['en', 'es']     // target languages
  limit_per_language: 150     // max per language
  sort: 'most_recent'         // or 'detailed_reviews'
}
```

**TripAdvisor Place Data** → `/api/locations/:id/tripadvisor-place/fetch`
```
Fetches enrichment data (rating, review count, photos, etc)
```

### Phase 2: Translate & Merge

**Input**: Raw reviews from Google + TripAdvisor
**Process**:
1. Detect language
2. Translate non-English to target language
3. Deduplicate similar reviews
4. Calculate quality scores
5. Filter low-quality reviews (rejects)

**Output**: `/api/locations/:id/reviews/translate-merge`
```json
{
  "merged_reviews": [
    {
      "id": "unique-id",
      "source": "google" | "tripadvisor",
      "original_text": "...",
      "translated_text": "...",
      "rating": 5,
      "date": "2024-01-15",
      "author": "Name",
      "language_detected": "es",
      "translated_to": "en",
      "quality_score": 0.92,
      "status": "accepted"
    }
  ],
  "rejected_reviews": [...],
  "statistics": {
    "total_fetched": 150,
    "after_dedup": 120,
    "accepted": 110,
    "rejected": 10
  }
}
```

### API Endpoints

**Fetch Phase**:
| Endpoint | Purpose |
|----------|---------|
| `POST /api/locations/:id/reviews/fetch-pipeline` | Fetch Google + TripAdvisor reviews |
| `POST /api/locations/:id/reviews/fetch` | Fetch Google reviews only |
| `POST /api/locations/:id/tripadvisor-reviews/fetch` | Fetch TripAdvisor reviews only |
| `POST /api/locations/:id/tripadvisor-place/fetch` | Fetch TripAdvisor place data |

**Status & Download**:
| Endpoint | Purpose |
|----------|---------|
| `GET /api/locations/:id/reviews/pipeline-status` | Pipeline execution status |
| `GET /api/locations/:id/reviews/download` | Download raw Google reviews |
| `GET /api/locations/:id/tripadvisor-reviews/download` | Download raw TripAdvisor reviews |
| `GET /api/locations/:id/tripadvisor-place/download` | Download TripAdvisor place data |

**Merge & Analysis**:
| Endpoint | Purpose |
|----------|---------|
| `POST /api/locations/:id/reviews/translate-merge` | Translate & merge reviews |
| `GET /api/locations/:id/reviews/merged/download` | Download merged reviews |
| `GET /api/locations/:id/reviews/merged/report` | Get merge report (statistics) |
| `GET /api/locations/:id/reviews/rejects/download` | Download rejected reviews |

### Key Services & Modules

- **ReviewsApiClient**: Google Reviews API integration
- **TripAdvisorReviewsApiClient**: TripAdvisor Reviews API
- **TripAdvisorPlaceService**: TripAdvisor place data (via SerpAPI)
- **runTranslateAndMergeReviews()**: Review aggregation & translation
  - Language detection
  - Deduplication logic
  - Quality scoring
  - Translation via external API

---

## Pipeline 3: JSON Export Pipeline

**Purpose**: Export location data in various JSON formats for different consumers.

### Export Formats

#### 3A: Location Export (for UI/Client)

**Endpoint**: `GET /api/locations/:id/export`

**Contains**: Location + TripAdvisor enrichment (NO reviews)

```json
{
  "id": 1,
  "title": "Restaurant Name",
  "type": "restaurant",
  "location_key": "pe_lima_miraflores",
  "address": "Calle Principal 123",
  "coordinates": { "lat": -12.0464, "lng": -77.0428 },
  "contact": {
    "phone": "+51 123 4567",
    "website": "https://...",
    "email": "info@..."
  },
  "media": {
    "gallery": [{ "url": "...", "caption": "..." }],
    "instagram": [{ "url": "...", "embedCode": "..." }]
  },
  "classification": {
    "cuisines": ["Peruvian"],
    "idealFor": ["Romantic"]
  },
  "enrichment": {
    "tripadvisor": {
      "rating": 4.5,
      "review_count": 250,
      "photos": [...]
    }
  }
}
```

#### 3B: AI JSON (for AI/ML models)

**Endpoint**: `GET /api/locations/:id/ai-json/download`

**Contains**: Full location data optimized for AI processing

```json
{
  "metadata": {
    "id": 1,
    "export_timestamp": "2024-02-14T18:00:00Z",
    "version": "1.0"
  },
  "location": {
    "name": "Restaurant Name",
    "type": "restaurant",
    "hierarchy": {
      "country": "Peru",
      "city": "Lima",
      "neighborhood": "Miraflores"
    },
    "coordinates": { "lat": -12.0464, "lng": -77.0428 },
    "timezone": "America/Lima"
  },
  "contact_info": {
    "address": "...",
    "phone": "+51 123 4567",
    "website": "https://...",
    "email": "info@...",
    "hours": {...}
  },
  "content": {
    "description": "...",
    "images": [...],
    "instagram_posts": [...]
  },
  "classification": {
    "primary_type": "restaurant",
    "sub_types": ["casual_dining"],
    "cuisines": ["Peruvian"],
    "attributes": ["budget_friendly", "romantic"]
  },
  "enrichment": {
    "google_reviews": {
      "avg_rating": 4.3,
      "count": 350,
      "samples": [...]
    },
    "tripadvisor": {
      "avg_rating": 4.5,
      "count": 250,
      "images": [...]
    }
  },
  "quality_metrics": {
    "data_completeness": 0.92,
    "image_coverage": 0.88,
    "review_coverage": 0.85
  }
}
```

### API Endpoints

| Endpoint | Purpose | Output |
|----------|---------|--------|
| `GET /api/locations/:id/export` | Full location export | JSON (Location + TripAdvisor) |
| `GET /api/locations/:id/ai-json/download` | AI-optimized export | JSON (Full enriched data) |

### Key Difference from Payload Sync

| Aspect | Payload Sync | JSON Export |
|--------|--------------|------------|
| **Target** | Payload CMS Collection | External APIs/UI |
| **Format** | Payload schema (tabs, fields) | Flat/nested JSON structure |
| **Frequency** | Batch or on-demand | On-demand |
| **Enrichment** | Minimal (just structure) | Full (Google + TA reviews) |
| **Reviews** | Not included | Can be included |

---

## Data Consistency & Conflict Resolution

### Single Master Document

The location database is the **source of truth**:

```
Database Location
    ↓
    ├→ Payload Sync (transform to Payload schema)
    ├→ Reviews Fetch (enrich with external reviews)
    └→ JSON Export (transform to export format)
```

**No reverse sync**: Updates go Location Manager → Payload, NOT the other way.

### Sync State Tracking

Each sync maintains state:
```json
{
  "locationId": 1,
  "collection": "dining",
  "payload_doc_id": "...",
  "last_sync_at": "2024-02-14T18:00:00Z",
  "status": "pending|syncing|completed|failed",
  "error_message": null
}
```

---

## Pipeline Initiation

### Trigger Points

**Payload Sync**:
- Manual: `/api/payload/sync/:id` POST
- Batch: `/api/payload/sync-all` POST
- Trigger: Webhook from Payload for changes

**Reviews Pipeline**:
- Manual: `/api/locations/:id/reviews/fetch-pipeline` POST
- Background job: Periodic refresh (configurable)

**JSON Export**:
- On-demand: GET endpoints called by frontend/client
- No background processing

### Idempotency

- **Payload Sync**: Idempotent (upsert pattern)
- **Reviews**: Non-idempotent (appends new reviews, deduplicates)
- **JSON Export**: Pure reads (always consistent)

---

## Error Handling & Monitoring

### Payload Sync Errors

```
❌ Location not found → NotFoundError
❌ Payload CMS offline → ServiceUnavailableError
❌ Missing location hierarchy → BadRequestError (auto-resolve attempted)
❌ Image upload fails → Error logged, sync continues
```

**Retry Strategy**: Manual retry via `/api/payload/sync/:id` or sync-all

### Reviews Fetch Errors

```
❌ API rate limit → Queued for retry
❌ No business_id found → Skip and log warning
❌ Translation service down → Store original + mark for retry
```

**Resume**: Pipeline maintains state, can resume from last checkpoint

### Recovery

- **Sync State**: Check `/api/payload/sync-status/:id`
- **Reviews Pipeline**: Check `/api/locations/:id/reviews/pipeline-status`
- **Logs**: Check server logs for detailed error traces

---

## Summary: Which Pipeline Does What?

| Pipeline | What Goes In | What Goes Out | When to Use |
|----------|-------------|---------------|------------|
| **Payload Sync** | Location document | Payload CMS entries (dining/accommodations/etc) | Publishing location to Questura |
| **Reviews** | Location document | Merged, translated reviews JSON | Enriching location with reviews |
| **JSON Export** | Location document | Flat JSON (location + TA data) | Providing data to external consumers |

---

## Configuration

Environment variables:
```bash
PAYLOAD_API_URL=https://questura-server.com/api
PAYLOAD_API_KEY=secret

GOOGLE_REVIEWS_API_KEY=...
TRIPADVISOR_API_KEY=...

TRANSLATION_API_URL=...
TRANSLATION_API_KEY=...

EXPORT_FORMAT_VERSION=1.0
```

---

## Next Steps for Implementation

1. **Separate service files** for each pipeline (already done: `payload-sync.service.ts`, `reviews-pipeline.controller.ts`)
2. **Clear pipeline orchestrators** - each with well-defined inputs/outputs
3. **Standardized error handling** - per pipeline
4. **Documentation**: Add to README + API docs
5. **Monitoring dashboard**: Track pipeline health
