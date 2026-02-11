# Payload Schema Proposal for `dining` (Location Manager Sync)

This proposal is designed so `location-manager` can sync to Payload without field rejections and can store the enrichment data we already track.

Target file in Payload app:
- `apps/questura/apps/server/src/features/data/dining/collections/Dining.ts`

## Why this is needed
Location Manager currently sends these `dining` fields in sync payload:
- `title`
- `locationRef`
- `gallery[].image`
- `gallery[].altText`
- `gallery[].caption`
- `instagramGallery[].post`
- `address`
- `countryCode`
- `phoneNumber`
- `website`
- `latitude`
- `longitude`
- `status`
- `type`
- `email`
- `neighborhoodDescription`
- `operationHours`

Location Manager also tracks and should be able to sync:
- `idealFor`
- `mealTypes`
- `cuisines`
- `features`
- `ianaTimeId`

## Proposed schema updates (copy/paste patch)
```diff
--- a/src/features/data/dining/collections/Dining.ts
+++ b/src/features/data/dining/collections/Dining.ts
@@
             {
               name: 'gallery',
               type: 'array',
               minRows: 0,
               maxRows: 20,
@@
               fields: [
                 {
                   name: 'image',
                   type: 'relationship',
                   relationTo: 'media-sets',
                   required: true,
                   admin: { description: 'Gallery media set' },
                 },
+                {
+                  name: 'altText',
+                  type: 'text',
+                  admin: {
+                    description: 'Optional per-image alt text from Location Manager',
+                  },
+                },
+                {
+                  name: 'caption',
+                  type: 'text',
+                  admin: {
+                    description: 'Optional per-image caption from Location Manager',
+                  },
+                },
                 {
                   name: 'preview',
                   type: 'ui',
                   admin: {
                     components: {
                       Field: 'src/features/media/components/MediaSetPreview.tsx',
                     },
                   },
                 },
               ],
             },
@@
             {
+              type: 'collapsible',
+              label: 'Location Manager Enrichment',
+              admin: {
+                initCollapsed: true,
+              },
+              fields: [
+                {
+                  name: 'idealFor',
+                  type: 'json',
+                  admin: {
+                    description: 'String[] ideal-for tags',
+                  },
+                },
+                {
+                  name: 'mealTypes',
+                  type: 'json',
+                  admin: {
+                    description: 'String[] meal types',
+                  },
+                },
+                {
+                  name: 'cuisines',
+                  type: 'json',
+                  admin: {
+                    description: 'String[] cuisines',
+                  },
+                },
+                {
+                  name: 'features',
+                  type: 'json',
+                  admin: {
+                    description: 'String[] dining features',
+                  },
+                },
+              ],
+            },
+            {
               name: 'instagramGallery',
               type: 'array',
               label: 'Instagram Gallery',
@@
                 {
                   name: 'website',
                   type: 'text',
                   admin: {
                     description: 'Website URL',
                   },
                 },
+                {
+                  name: 'email',
+                  type: 'email',
+                  admin: {
+                    description: 'Contact email from Location Manager',
+                  },
+                },
+                {
+                  name: 'neighborhoodDescription',
+                  type: 'textarea',
+                  admin: {
+                    description: 'Neighborhood context from Location Manager',
+                    rows: 3,
+                  },
+                },
+                {
+                  name: 'operationHours',
+                  type: 'json',
+                  admin: {
+                    description: 'Structured operation hours object from Location Manager',
+                  },
+                },
+                {
+                  name: 'ianaTimeId',
+                  type: 'text',
+                  admin: {
+                    description: 'IANA timezone (example: America/Bogota)',
+                  },
+                  validate: (value) => {
+                    if (!value) return true
+                    return typeof value === 'string' && value.includes('/')
+                      ? true
+                      : 'Use IANA timezone format, e.g. America/Bogota'
+                  },
+                },
               ],
             },
```

## API payload example this schema supports
```json
{
  "title": "Test Dining",
  "locationRef": 123,
  "type": "restaurant",
  "gallery": [
    {
      "image": 987,
      "altText": "Front facade",
      "caption": "Main entrance"
    }
  ],
  "instagramGallery": [
    {
      "post": 456
    }
  ],
  "address": "https://maps.google.com/?q=...",
  "countryCode": "+57",
  "phoneNumber": "3001234567",
  "website": "https://example.com",
  "email": "info@example.com",
  "neighborhoodDescription": "Historic district with many cafes",
  "operationHours": {
    "monday": [{ "open": "09:00", "close": "22:00" }]
  },
  "idealFor": ["Date Nights", "Fine Dining"],
  "mealTypes": ["Dinner"],
  "cuisines": ["Peruvian", "Seafood"],
  "features": ["Reservations", "Outdoor Seating"],
  "ianaTimeId": "America/Bogota",
  "latitude": 4.711,
  "longitude": -74.072,
  "status": "published"
}
```

## Notes for Payload dev
- This patch is backward-compatible because all new fields are optional.
- If you want strict taxonomy references for `idealFor`, we can later migrate `idealFor` from `json` to `relationship` (`perfect-for-tags`) once Location Manager maps labels to tag IDs.
- To align end-to-end, map upstream source-specific taxonomy fields into the generic payload keys: `mealTypes`, `cuisines`, and `features`.
- If the same sync contract applies to `accommodations`, `attractions`, and `nightlife`, apply the same new fields there too for consistency.
