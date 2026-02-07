# Collection API Report: `article-tags`

- Source: `references/payload_api_report.md`
- Collection: `article-tags`

### `article-tags`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/article-tags` |
| `findByID` | `GET` | `https://example.com/api/article-tags/:id` |
| `count` | `GET` | `https://example.com/api/article-tags/count` |
| `create` | `POST` | `https://example.com/api/article-tags` |
| `update` | `PATCH` | `https://example.com/api/article-tags/:id` |
| `delete` | `DELETE` | `https://example.com/api/article-tags/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `text` | Yes | - |
| `slug` | `text` | No | - |
| `displayName` | `text` | No | - |
| `description` | `textarea` | No | - |
| `usageCount` | `number` | No | - |
| `status` | `select` | No | - |
| `createdBy` | `relationship` | No | - |

#### Required Fields

- `name`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

