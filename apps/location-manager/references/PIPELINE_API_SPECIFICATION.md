# Pipeline Status API Specification

Backend endpoints needed to power the three pipeline checklists in the UI.

---

## Endpoint 1: Payload Sync Checklist

### GET `/api/locations/:id/payload-sync/checklist`

Returns the current state of all Payload sync requirements.

**Request**:
```bash
GET /api/locations/123/payload-sync/checklist
```

**Response** (200 OK):
```json
{
  "completionPercent": 80,
  "lastSyncedAt": "2024-02-14T18:30:00Z",
  "syncStatus": "ready",
  "targetCollection": "dining",
  "errorMessage": null,

  "items": [
    {
      "category": "BASIC INFORMATION",
      "fields": [
        {
          "name": "Title",
          "fieldPath": "title",
          "value": "Restaurant Name",
          "required": true,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Type",
          "fieldPath": "type",
          "value": "restaurant",
          "required": true,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Price Level",
          "fieldPath": "priceLevel",
          "value": null,
          "required": false,
          "status": "missing",
          "recommended": true,
          "note": "Shown as $ symbols in Payload"
        }
      ]
    },
    {
      "category": "VISUALS",
      "fields": [
        {
          "name": "Gallery Images",
          "fieldPath": "gallery",
          "value": ["image1.jpg", "image2.jpg", "image3.jpg", "image4.jpg"],
          "valueCount": 4,
          "required": true,
          "minRequired": 1,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Instagram Gallery",
          "fieldPath": "instagramGallery",
          "value": ["post1", "post2"],
          "valueCount": 2,
          "required": false,
          "status": "complete",
          "recommended": false
        }
      ]
    },
    {
      "category": "CLASSIFICATION",
      "fields": [
        {
          "name": "Cuisines",
          "fieldPath": "cuisines",
          "value": ["Peruvian", "Seafood"],
          "required": false,
          "status": "complete",
          "recommended": true
        },
        {
          "name": "Ideal For Tags",
          "fieldPath": "idealFor",
          "value": ["Romantic", "Casual"],
          "required": false,
          "status": "complete",
          "recommended": true
        }
      ]
    },
    {
      "category": "LOCATION & CONTACT",
      "fields": [
        {
          "name": "Location Hierarchy",
          "fieldPath": "location_hierarchy",
          "value": {
            "country": "Peru",
            "city": "Lima",
            "neighborhood": "Miraflores"
          },
          "required": true,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Address",
          "fieldPath": "address",
          "value": "Calle Principal 123",
          "required": true,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Coordinates",
          "fieldPath": "coordinates",
          "value": {
            "latitude": -12.0464,
            "longitude": -77.0428
          },
          "required": true,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Phone Number",
          "fieldPath": "phoneNumber",
          "value": "+51 1 234 5678",
          "required": false,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Website",
          "fieldPath": "website",
          "value": "https://restaurant.com",
          "required": false,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Email",
          "fieldPath": "email",
          "value": "info@restaurant.com",
          "required": false,
          "status": "complete",
          "recommended": false
        },
        {
          "name": "Hours of Operation",
          "fieldPath": "operationHours",
          "value": {"mon": "12:00-23:00", "tue": "12:00-23:00"},
          "required": false,
          "status": "complete",
          "recommended": true
        },
        {
          "name": "Timezone",
          "fieldPath": "ianaTimeId",
          "value": "America/Lima",
          "required": false,
          "status": "complete",
          "recommended": true
        }
      ]
    },
    {
      "category": "PAYLOAD INTEGRATION",
      "fields": [
        {
          "name": "Location Ref",
          "fieldPath": "payload_location_ref",
          "value": "550e8400-e29b-41d4-a716-446655440000",
          "required": true,
          "status": "complete",
          "note": "Auto-resolved from location hierarchy"
        }
      ]
    }
  ],

  "summary": {
    "totalItems": 18,
    "completeItems": 15,
    "missingRequired": [],
    "missingRecommended": ["priceLevel"],
    "warnings": []
  },

  "canSync": true,
  "actions": {
    "sync": true,
    "viewInPayload": true,
    "testConnection": true
  }
}
```

**Implementation Notes**:
- Calculate `completionPercent` as: `(completeItems / totalItems) * 100`
- `canSync` = all required fields present AND valid
- Include `recommended` fields for better UX
- Return actual values so UI can show what's missing

---

## Endpoint 2: Reviews Checklist

### GET `/api/locations/:id/reviews/checklist`

Returns the current state of all reviews pipeline steps.

**Request**:
```bash
GET /api/locations/123/reviews/checklist
```

**Response** (200 OK):
```json
{
  "completionPercent": 65,

  "fetchPhase": {
    "status": "in_progress",
    "steps": [
      {
        "name": "Google Reviews",
        "status": "complete",
        "icon": "✅",
        "details": {
          "reviewCount": 47,
          "avgRating": 4.2,
          "languages": {
            "en": 32,
            "es": 15
          },
          "fetchedAt": "2024-02-14T10:30:00Z",
          "nextRefreshAt": "2024-02-21T10:30:00Z"
        },
        "actions": {
          "reFetch": true,
          "viewRaw": true
        }
      },
      {
        "name": "TripAdvisor Reviews",
        "status": "fetching",
        "icon": "⏳",
        "details": {
          "progress": 40,
          "reviewsFetched": 60,
          "targetCount": 150,
          "languages": {
            "en": 50,
            "es": 10
          },
          "startedAt": "2024-02-14T15:00:00Z",
          "estimatedTime": "2 minutes"
        },
        "actions": {
          "pause": true,
          "cancel": true,
          "viewProgress": true
        }
      },
      {
        "name": "TripAdvisor Place Data",
        "status": "complete",
        "icon": "✅",
        "details": {
          "rating": 4.5,
          "reviewCount": 250,
          "ranking": 5,
          "photoCount": 42,
          "fetchedAt": "2024-02-14T10:45:00Z"
        },
        "actions": {
          "viewPlacePage": true
        }
      }
    ]
  },

  "mergePhase": {
    "status": "ready_to_start",
    "message": "Waiting for TripAdvisor Reviews to complete",
    "icon": "⏳",
    "prerequisites": {
      "googleReviewsComplete": true,
      "tripAdvisorReviewsComplete": false,
      "tripAdvisorPlaceComplete": true
    },
    "estimatedStats": {
      "totalReviewsAfterFetch": 107,
      "estimatedAfterDedup": 95,
      "estimatedAccepted": 88
    },
    "actions": {
      "startMerge": false,
      "preview": false
    }
  },

  "summary": {
    "totalFetched": 47,
    "sources": {
      "google": {
        "count": 47,
        "ready": true
      },
      "tripadvisor_reviews": {
        "count": 60,
        "progress": 40,
        "ready": false
      },
      "tripadvisor_place": {
        "rating": 4.5,
        "ready": true
      }
    }
  },

  "timeline": [
    {
      "step": 1,
      "name": "Fetch Google Reviews",
      "status": "complete",
      "duration": "45 seconds"
    },
    {
      "step": 2,
      "name": "Fetch TripAdvisor Reviews",
      "status": "in_progress",
      "progress": 40,
      "duration": "~2 minutes remaining"
    },
    {
      "step": 3,
      "name": "Fetch TripAdvisor Place",
      "status": "complete",
      "duration": "30 seconds"
    },
    {
      "step": 4,
      "name": "Translate & Merge",
      "status": "waiting",
      "blocker": "Waiting for step 2"
    },
    {
      "step": 5,
      "name": "Generate Report",
      "status": "waiting",
      "blocker": "Waiting for step 4"
    }
  ]
}
```

**After Merge Completes**:
```json
{
  "mergePhase": {
    "status": "complete",
    "icon": "✅",
    "stats": {
      "totalFetched": 107,
      "afterDeduplication": 95,
      "accepted": 88,
      "rejected": 7,
      "qualityThreshold": 0.70,
      "completionTime": "3 minutes 45 seconds"
    },
    "languages": {
      "en": 60,
      "translated_from_es": 25,
      "translated_from_fr": 3
    },
    "topKeywords": [
      {
        "keyword": "Great food",
        "mentions": 18,
        "sentiment": "positive"
      },
      {
        "keyword": "Slow service",
        "mentions": 12,
        "sentiment": "negative"
      },
      {
        "keyword": "Expensive",
        "mentions": 8,
        "sentiment": "negative"
      }
    ],
    "actions": {
      "viewMerged": true,
      "viewRejects": true,
      "downloadReport": true
    }
  }
}
```

---

## Endpoint 3: JSON Export Checklist

### GET `/api/locations/:id/json-export/checklist`

Returns schema coverage for both export formats.

**Request**:
```bash
GET /api/locations/123/json-export/checklist
```

**Response** (200 OK):
```json
{
  "locationExport": {
    "completionPercent": 85,
    "canExport": true,
    "fileSize": "47 KB",
    "sections": [
      {
        "name": "METADATA",
        "completionPercent": 100,
        "fields": [
          {
            "name": "id",
            "type": "number",
            "value": 123,
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "title",
            "type": "string",
            "value": "Restaurant Name",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "export_timestamp",
            "type": "date",
            "included": true,
            "required": true,
            "status": "complete"
          }
        ]
      },
      {
        "name": "LOCATION INFORMATION",
        "completionPercent": 100,
        "fields": [
          {
            "name": "type",
            "type": "string",
            "value": "restaurant",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "hierarchy.country",
            "type": "string",
            "value": "Peru",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "hierarchy.city",
            "type": "string",
            "value": "Lima",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "hierarchy.neighborhood",
            "type": "string",
            "value": "Miraflores",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "coordinates.latitude",
            "type": "number",
            "value": -12.0464,
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "coordinates.longitude",
            "type": "number",
            "value": -77.0428,
            "included": true,
            "required": true,
            "status": "complete"
          }
        ]
      },
      {
        "name": "CONTACT INFORMATION",
        "completionPercent": 100,
        "fields": [
          {
            "name": "address",
            "type": "string",
            "value": "Calle Principal 123",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "phone",
            "type": "string",
            "value": "+51 1 234 5678",
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "website",
            "type": "string",
            "value": "https://restaurant.com",
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "email",
            "type": "string",
            "value": "info@restaurant.com",
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "hours",
            "type": "object",
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "timezone",
            "type": "string",
            "value": "America/Lima",
            "included": true,
            "required": false,
            "status": "complete"
          }
        ]
      },
      {
        "name": "MEDIA",
        "completionPercent": 100,
        "fields": [
          {
            "name": "gallery",
            "type": "array",
            "valueCount": 4,
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "instagram",
            "type": "array",
            "valueCount": 2,
            "included": true,
            "required": false,
            "status": "complete"
          }
        ]
      },
      {
        "name": "CLASSIFICATION",
        "completionPercent": 100,
        "fields": [
          {
            "name": "cuisines",
            "type": "array",
            "value": ["Peruvian", "Seafood"],
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "idealFor",
            "type": "array",
            "value": ["Romantic", "Casual"],
            "included": true,
            "required": false,
            "status": "complete"
          }
        ]
      },
      {
        "name": "ENRICHMENT",
        "completionPercent": 100,
        "fields": [
          {
            "name": "tripadvisor.rating",
            "type": "number",
            "value": 4.5,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          },
          {
            "name": "tripadvisor.review_count",
            "type": "number",
            "value": 250,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          },
          {
            "name": "tripadvisor.photos",
            "type": "array",
            "valueCount": 42,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          }
        ]
      }
    ],

    "actions": {
      "download": true,
      "preview": true
    }
  },

  "aiJsonExport": {
    "completionPercent": 60,
    "canExport": true,
    "fileSize": "150 KB",
    "qualityScore": 0.85,
    "sections": [
      {
        "name": "METADATA",
        "completionPercent": 100,
        "fields": [
          {
            "name": "export_timestamp",
            "type": "date",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "version",
            "type": "string",
            "value": "1.0",
            "included": true,
            "required": true,
            "status": "complete"
          }
        ]
      },
      {
        "name": "LOCATION DATA",
        "completionPercent": 100,
        "fields": [
          {
            "name": "name",
            "type": "string",
            "value": "Restaurant Name",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "type",
            "type": "string",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "hierarchy",
            "type": "object",
            "included": true,
            "required": true,
            "status": "complete"
          },
          {
            "name": "coordinates",
            "type": "object",
            "included": true,
            "required": true,
            "status": "complete"
          }
        ]
      },
      {
        "name": "GOOGLE REVIEWS ENRICHMENT",
        "completionPercent": 100,
        "fields": [
          {
            "name": "avg_rating",
            "type": "number",
            "value": 4.2,
            "included": true,
            "required": false,
            "source": "google_reviews",
            "status": "complete"
          },
          {
            "name": "review_count",
            "type": "number",
            "value": 47,
            "included": true,
            "required": false,
            "source": "google_reviews",
            "status": "complete"
          },
          {
            "name": "top_keywords",
            "type": "array",
            "included": true,
            "required": false,
            "source": "google_reviews",
            "status": "complete"
          }
        ]
      },
      {
        "name": "TRIPADVISOR ENRICHMENT",
        "completionPercent": 100,
        "fields": [
          {
            "name": "avg_rating",
            "type": "number",
            "value": 4.5,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          },
          {
            "name": "review_count",
            "type": "number",
            "value": 250,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          },
          {
            "name": "ranking",
            "type": "number",
            "value": 5,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          },
          {
            "name": "photos",
            "type": "array",
            "valueCount": 42,
            "included": true,
            "required": false,
            "source": "tripadvisor",
            "status": "complete"
          }
        ]
      },
      {
        "name": "MERGED REVIEWS",
        "completionPercent": 100,
        "fields": [
          {
            "name": "merged_reviews",
            "type": "array",
            "valueCount": 88,
            "included": true,
            "required": false,
            "source": "merged_reviews",
            "status": "complete"
          },
          {
            "name": "rejected_reviews",
            "type": "array",
            "valueCount": 7,
            "included": true,
            "required": false,
            "source": "merged_reviews",
            "status": "complete"
          }
        ]
      },
      {
        "name": "QUALITY METRICS",
        "completionPercent": 100,
        "fields": [
          {
            "name": "data_completeness",
            "type": "number",
            "value": 0.92,
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "image_coverage",
            "type": "number",
            "value": 0.88,
            "included": true,
            "required": false,
            "status": "complete"
          },
          {
            "name": "review_coverage",
            "type": "number",
            "value": 0.85,
            "included": true,
            "required": false,
            "status": "complete"
          }
        ]
      }
    ],

    "actions": {
      "download": true,
      "preview": true
    }
  },

  "comparison": {
    "fieldsOnlyInLocationExport": [],
    "fieldsOnlyInAiJson": ["merged_reviews", "quality_metrics", "google_reviews"],
    "fieldsInBoth": ["metadata", "location", "contact", "media", "tripadvisor"]
  }
}
```

---

## Endpoint 4: Combined Status (Optional)

### GET `/api/locations/:id/pipelines/status`

Get all three checklist statuses in a single call (useful for initial page load).

**Request**:
```bash
GET /api/locations/123/pipelines/status
```

**Response** (200 OK):
```json
{
  "payload_sync": { /* Full response from endpoint 1 */ },
  "reviews": { /* Full response from endpoint 2 */ },
  "json_export": { /* Full response from endpoint 3 */ }
}
```

---

## Real-time Updates (WebSocket)

For real-time status updates during long operations:

**Subscribe**:
```javascript
ws = new WebSocket('wss://api.example.com/ws/locations/123/pipelines');
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // update.type: 'reviews_fetch_progress', 'payload_sync_status', etc
  // update.data: updated checklist data
};
```

**Message Types**:
- `reviews_fetch_progress` - TripAdvisor fetch progress
- `reviews_merge_progress` - Merge & translate progress
- `payload_sync_status` - Payload sync started/completed
- `json_export_ready` - Export ready for download

---

## Error Handling

All endpoints return errors in consistent format:

```json
{
  "error": {
    "code": "FETCH_FAILED",
    "message": "Failed to fetch Google Reviews: API rate limited",
    "details": {
      "source": "google",
      "retryAfter": 3600,
      "nextAttempt": "2024-02-14T19:30:00Z"
    }
  }
}
```

---

## Implementation Strategy

1. **Phase 1**: Implement endpoints 1 & 3 (static status)
2. **Phase 2**: Implement endpoint 2 (reviews with progress)
3. **Phase 3**: Add WebSocket for real-time updates
4. **Phase 4**: Integrate UI components

---

## Caching

- Checklist responses can be cached for 30 seconds
- Invalidate cache on successful pipeline action (sync, fetch, merge)
- Use ETags for efficient cache validation

