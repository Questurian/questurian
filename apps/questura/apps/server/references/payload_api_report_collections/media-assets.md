# Collection API Report: `media-assets`

- Source: `references/payload_api_report.md`
- Collection: `media-assets`

### `media-assets`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/media-assets` |
| `findByID` | `GET` | `https://example.com/api/media-assets/:id` |
| `count` | `GET` | `https://example.com/api/media-assets/count` |
| `create` | `POST` | `https://example.com/api/media-assets` |
| `update` | `PATCH` | `https://example.com/api/media-assets/:id` |
| `delete` | `DELETE` | `https://example.com/api/media-assets/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user` | `relationship` | No | - |
| `uploadedBy` | `text` | No | - |
| `mediaSet` | `relationship` | No | - |
| `variant` | `select` | No | - |
| `alt_text` | `text` | No | - |
| `photographer_credit` | `text` | No | - |
| `location` | `text` | No | - |
| `locationRef` | `relationship` | No | - |
| `location_finalized` | `checkbox` | No | - |
| `tags` | `relationship` | No | - |

#### Required Fields

- None

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `user` | `relationship` | No | `users` |
| `mediaSet` | `relationship` | No | `media-sets` |
| `locationRef` | `relationship` | No | `locations` |
| `tags` | `relationship` | Yes | `article-tags` |

#### Block Definitions

- None

