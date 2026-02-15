# Location Manager: Quick Reference Guide

## The 3 Export Pipelines at a Glance

```
MASTER LOCATION DOCUMENT
        │
        ├─────────────────────────────────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
    PAYLOAD SYNC                                           REVIEWS + JSON
    (Questura Backend)                                     (External Data)
        │                                                         │
        ├─► /api/payload/sync/:id              ├─► /api/locations/:id/reviews/fetch-pipeline
        ├─► /api/payload/sync-all              ├─► /api/locations/:id/tripadvisor-place/fetch
        └─► /api/payload/sync-status           ├─► /api/locations/:id/reviews/translate-merge
                                               ├─► /api/locations/:id/export
                                               └─► /api/locations/:id/ai-json/download
```

---

## Pipeline 1: Payload Sync ⚡

### What it does
Transforms location data and syncs to Payload CMS collections (dining, accommodations, attractions, nightlife).

### Input
Location document with:
- Title, type, galleries, cuisines, idealFor
- Address, phone, website, email, hours, timezone
- Coordinates, location hierarchy

### Process
1. Upload images → create media-sets in Payload
2. Upload Instagram posts → create Instagram posts in Payload
3. Map location to Payload schema (with tabs: Basic Info, Classification, Location & Contact)
4. Upsert collection entry

### Output
```
Payload CMS Collections:
- /api/dining
- /api/accommodations
- /api/attractions
- /api/nightlife
```

### Endpoints (RESTful)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/payload/sync/:id` | Sync single location |
| POST | `/api/payload/sync-all` | Sync all locations (batch) |
| GET | `/api/payload/sync-status` | Get all sync statuses |
| GET | `/api/payload/sync-status/:id` | Get single sync status |
| GET | `/api/payload/test-connection` | Verify Payload connection |

### Service
`PayloadSyncService` → `syncLocation(id)` / `syncAllLocations(filter)`

### Output Format
```json
{
  "title": "...",
  "tab:Basic Info": { "type", "priceLevel", "gallery", "instagramGallery" },
  "tab:Classification": { "cuisines", "idealFor", "Location Manager Enrichment" },
  "tab:Location & Contact": { "address", "phone", "email", "operationHours", "ianaTimeId", "coordinates" }
}
```

---

## Pipeline 2: Reviews Pipeline 📝

### What it does
Fetches reviews from Google & TripAdvisor, translates them, deduplicates, and merges into single JSON.

### Two Phases

#### Phase A: Fetch
Fetch raw reviews from external sources:
- **Google** → `/api/locations/:id/reviews/fetch-pipeline`
- **TripAdvisor Reviews** → `/api/locations/:id/tripadvisor-reviews/fetch`
- **TripAdvisor Place** → `/api/locations/:id/tripadvisor-place/fetch`

Status tracking:
- GET `/api/locations/:id/reviews/pipeline-status`
- GET `/api/locations/:id/reviews/download`
- GET `/api/locations/:id/tripadvisor-reviews/download`

#### Phase B: Translate & Merge
Combine reviews from both sources:
- POST `/api/locations/:id/reviews/translate-merge`

Download results:
- GET `/api/locations/:id/reviews/merged/download` (merged reviews)
- GET `/api/locations/:id/reviews/merged/report` (statistics)
- GET `/api/locations/:id/reviews/rejects/download` (filtered out reviews)

### Process
```
Google Reviews API ──┐
                     ├─→ Translate to target language
TripAdvisor API ─────┤   ├─→ Deduplicate
                     ├─→ Quality score
                     └─→ Accept/Reject
```

### Output Format
```json
{
  "merged_reviews": [
    {
      "id": "unique-id",
      "source": "google|tripadvisor",
      "original_text": "...",
      "translated_text": "...",
      "rating": 5,
      "date": "2024-01-15",
      "quality_score": 0.92,
      "status": "accepted"
    }
  ],
  "rejected_reviews": [...],
  "statistics": {
    "total_fetched": 150,
    "after_dedup": 120,
    "accepted": 110
  }
}
```

### Services
- `ReviewsApiClient` (Google)
- `TripAdvisorReviewsApiClient` (TripAdvisor)
- `runTranslateAndMergeReviews()` (Merge logic)

---

## Pipeline 3: JSON Export 📦

### What it does
Exports location data in different JSON formats for consumption by different systems.

### Two Formats

#### 3A: Location Export (UI/Client)
Endpoint: `GET /api/locations/:id/export`

**Contains**: Location data + TripAdvisor enrichment (NO reviews)
```json
{
  "id": 1,
  "title": "Restaurant Name",
  "type": "restaurant",
  "address": "...",
  "coordinates": { "lat": -12.0464, "lng": -77.0428 },
  "contact": { "phone": "...", "website": "...", "email": "..." },
  "media": { "gallery": [...], "instagram": [...] },
  "classification": { "cuisines": [...], "idealFor": [...] },
  "enrichment": { "tripadvisor": { "rating": 4.5, "review_count": 250 } }
}
```

#### 3B: AI JSON (AI/ML Models)
Endpoint: `GET /api/locations/:id/ai-json/download`

**Contains**: Full enriched data optimized for AI
```json
{
  "metadata": { "id": 1, "export_timestamp": "...", "version": "1.0" },
  "location": { "name": "...", "type": "...", "hierarchy": {...}, "coordinates": {...} },
  "contact_info": { "address": "...", "phone": "...", "hours": {...} },
  "content": { "description": "...", "images": [...] },
  "classification": { "primary_type": "...", "cuisines": [...], "attributes": [...] },
  "enrichment": { "google_reviews": {...}, "tripadvisor": {...} },
  "quality_metrics": { "data_completeness": 0.92 }
}
```

### Services
- None (pure transformation + serialization)

---

## Key Differences

| Aspect | Payload Sync | Reviews | JSON Export |
|--------|--------------|---------|------------|
| **Target System** | Payload CMS | Review databases | Frontend/Client/AI |
| **Data Source** | Location DB | Google + Tripadvisor | Location DB + TA |
| **Frequency** | Manual/Batch | Manual/Scheduled | On-demand |
| **Transform** | Schema mapping | Language + dedup | Format conversion |
| **Reviews Included** | ❌ No | ✅ Yes | ⚠️ Optional |
| **Idempotent** | ✅ Yes | ❌ No | ✅ Yes |
| **State Tracking** | ✅ Yes | ✅ Yes | ❌ No |
| **Reverse Sync** | ❌ One-way | ✅ Append | ❌ No |

---

## Common Tasks

### Task: Sync a location to Payload
```bash
POST /api/payload/sync/123
→ PayloadSyncService.syncLocation(123)
→ Output: Payload CMS entry for dining/accommodations/etc
```

### Task: Get reviews for a location
```bash
1. POST /api/locations/123/reviews/fetch-pipeline
   → Fetches Google + TripAdvisor reviews
2. GET /api/locations/123/reviews/pipeline-status
   → Check fetch status
3. POST /api/locations/123/reviews/translate-merge
   → Merge and translate reviews
4. GET /api/locations/123/reviews/merged/download
   → Download merged JSON
```

### Task: Export location data
```bash
GET /api/locations/123/export
→ Returns JSON for UI/client
```

### Task: Get AI-ready data
```bash
GET /api/locations/123/ai-json/download
→ Returns full enriched JSON optimized for ML
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────┐
│     LOCATION MANAGER DATABASE            │
│  (master source of truth)                │
└────────────┬─────────────────────────────┘
             │
   ┌─────────┴──────────┬──────────┐
   │                    │          │
   ▼                    ▼          ▼
┌─────────┐      ┌──────────┐  ┌─────────┐
│ PAYLOAD │      │ REVIEWS  │  │  JSON   │
│  SYNC   │      │ PIPELINE │  │ EXPORT  │
└────┬────┘      └────┬─────┘  └────┬────┘
     │                │             │
     │  Transform     │  Fetch +     │  Format
     │  + Upload      │  Translate   │  Convert
     │                │              │
     ▼                ▼              ▼
┌─────────┐      ┌──────────┐  ┌─────────┐
│ Payload │      │ Reviews  │  │  JSON   │
│  CMS    │      │  JSON    │  │ Export  │
└─────────┘      └──────────┘  └─────────┘
     │                │             │
     └────────────────┴─────────────┴──→ Questura Frontend + External APIs
```

---

## Error Recovery

### Payload Sync Failed?
1. Check status: `GET /api/payload/sync-status/:id`
2. Review error message
3. Fix issue (missing media, hierarchy, etc)
4. Retry: `POST /api/payload/sync/:id`

### Reviews Fetch Stuck?
1. Check pipeline status: `GET /api/locations/:id/reviews/pipeline-status`
2. Look at logs (rate limits? API down?)
3. Retry fetch: `POST /api/locations/:id/reviews/fetch-pipeline`
4. Continue from merge: `POST /api/locations/:id/reviews/translate-merge`

### JSON Export Issues?
- Pure reads, no state
- Check server logs
- Verify location exists in database

---

## Configuration

```bash
# Payload integration
PAYLOAD_API_URL=https://questura-server.com/api
PAYLOAD_API_KEY=secret

# Reviews APIs
GOOGLE_REVIEWS_API_KEY=...
TRIPADVISOR_API_KEY=...
TRANSLATION_SERVICE_URL=...

# Export settings
EXPORT_FORMAT_VERSION=1.0
AI_JSON_INCLUDE_REVIEWS=false
```

---

## See Also

- [EXPORT_PIPELINES.md](./EXPORT_PIPELINES.md) - Detailed architecture
- API Routes: `src/features/locations/routes/location.routes.ts`
- Services: `src/features/locations/services/`
- Controllers: `src/features/locations/controllers/`
