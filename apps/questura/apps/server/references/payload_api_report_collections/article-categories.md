# Collection API Report: `article-categories`

- Source: `references/payload_api_report.md`
- Collection: `article-categories`

### `article-categories`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/article-categories` |
| `findByID` | `GET` | `https://example.com/api/article-categories/:id` |
| `count` | `GET` | `https://example.com/api/article-categories/count` |
| `create` | `POST` | `https://example.com/api/article-categories` |
| `update` | `PATCH` | `https://example.com/api/article-categories/:id` |
| `delete` | `DELETE` | `https://example.com/api/article-categories/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `text` | Yes | - |
| `slug` | `text` | No | - |
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

