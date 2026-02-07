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

#### Required Fields

- `level`
- `country`
- `countryName`

#### Relationship Fields

- None

#### Block Definitions

- None

