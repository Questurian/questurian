# Collection API Report: `perfect-for-tags`

- Source: `references/payload_api_report.md`
- Collection: `perfect-for-tags`

### `perfect-for-tags`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/perfect-for-tags` |
| `findByID` | `GET` | `https://example.com/api/perfect-for-tags/:id` |
| `count` | `GET` | `https://example.com/api/perfect-for-tags/count` |
| `create` | `POST` | `https://example.com/api/perfect-for-tags` |
| `update` | `PATCH` | `https://example.com/api/perfect-for-tags/:id` |
| `delete` | `DELETE` | `https://example.com/api/perfect-for-tags/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `text` | Yes | - |
| `slug` | `text` | No | - |
| `category` | `select` | Yes | - |
| `applicableTypes` | `select` | Yes | - |
| `description` | `textarea` | No | - |
| `status` | `select` | No | - |
| `usageCount` | `number` | No | - |
| `createdBy` | `relationship` | No | - |

#### Required Fields

- `label`
- `category`
- `applicableTypes`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

