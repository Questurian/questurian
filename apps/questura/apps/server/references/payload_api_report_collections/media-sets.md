# Collection API Report: `media-sets`

- Source: `references/payload_api_report.md`
- Collection: `media-sets`

### `media-sets`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/media-sets` |
| `findByID` | `GET` | `https://example.com/api/media-sets/:id` |
| `count` | `GET` | `https://example.com/api/media-sets/count` |
| `create` | `POST` | `https://example.com/api/media-sets` |
| `update` | `PATCH` | `https://example.com/api/media-sets/:id` |
| `delete` | `DELETE` | `https://example.com/api/media-sets/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `text` | Yes | - |
| `alt_text` | `text` | No | - |
| `photographer_credit` | `text` | No | - |
| `variants` | `group` | No | - |
| `variants.thumbnail` | `relationship` | No | - |
| `variants.square` | `relationship` | No | - |
| `variants.wide` | `relationship` | No | - |
| `variants.portrait` | `relationship` | No | - |
| `variants.hero` | `relationship` | No | - |
| `externalRef` | `text` | No | - |
| `status` | `select` | No | - |
| `createdBy` | `relationship` | No | - |
| `location` | `text` | No | - |
| `locationRef` | `relationship` | No | - |
| `location_finalized` | `checkbox` | No | - |
| `tags` | `relationship` | No | - |

#### Required Fields

- `title`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `variants.thumbnail` | `relationship` | No | `media-assets` |
| `variants.square` | `relationship` | No | `media-assets` |
| `variants.wide` | `relationship` | No | `media-assets` |
| `variants.portrait` | `relationship` | No | `media-assets` |
| `variants.hero` | `relationship` | No | `media-assets` |
| `createdBy` | `relationship` | No | `users` |
| `locationRef` | `relationship` | No | `locations` |
| `tags` | `relationship` | Yes | `article-tags` |

#### Block Definitions

- None

