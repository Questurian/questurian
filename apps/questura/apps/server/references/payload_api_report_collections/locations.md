# Collection API Report: `locations`

- Source: `references/payload_api_report.md`
- Collection: `locations`

### `locations`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/locations` |
| `findByID` | `GET` | `https://example.com/api/locations/:id` |
| `count` | `GET` | `https://example.com/api/locations/count` |
| `create` | `POST` | `https://example.com/api/locations` |
| `update` | `PATCH` | `https://example.com/api/locations/:id` |
| `delete` | `DELETE` | `https://example.com/api/locations/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `level` | `select` | Yes | - |
| `country` | `text` | Yes | - |
| `city` | `text` | No | - |
| `neighborhood` | `text` | No | - |
| `locationKey` | `text` | No | - |
| `parentKey` | `text` | No | - |
| `countryName` | `text` | Yes | - |
| `cityName` | `text` | No | - |
| `neighborhoodName` | `text` | No | - |
| `guide` | `group` | No | Structured guide content container |
| `guide.media` | `group` | No | Cover/map assets and map coordinates/bounds |
| `guide.countryData` | `group` | No | Country-only legal, health, and money facts |
| `guide.localShared` | `group` | No | City/neighborhood shared overview content |
| `guide.explore` | `group` | No | Tourist-focused city/neighborhood content |
| `guide.stay` | `group` | No | Nomad/extended-stay city/neighborhood content |
| `guide.move` | `group` | No | Relocation-focused city/neighborhood content |

#### Required Fields

- `level`
- `country`
- `countryName`

#### Relationship Fields

- `guide.media.coverImage` → `media-sets`
- `guide.localShared.usefulApps.apps.logo` → `media-sets`
- `guide.explore.highlights.relatedNeighborhoods` → `locations`
- `guide.stay.highlights.relatedNeighborhoods` → `locations`
- `guide.move.highlights.relatedNeighborhoods` → `locations`

#### Block Definitions

- None
