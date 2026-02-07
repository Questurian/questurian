# Collection API Report: `affiliate-products`

- Source: `references/payload_api_report.md`
- Collection: `affiliate-products`

### `affiliate-products`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/affiliate-products` |
| `findByID` | `GET` | `https://example.com/api/affiliate-products/:id` |
| `count` | `GET` | `https://example.com/api/affiliate-products/count` |
| `create` | `POST` | `https://example.com/api/affiliate-products` |
| `update` | `PATCH` | `https://example.com/api/affiliate-products/:id` |
| `delete` | `DELETE` | `https://example.com/api/affiliate-products/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `text` | Yes | - |
| `tab:Details.type` | `select` | No | - |
| `tab:Details.featuredImage` | `upload` | No | - |
| `createdBy` | `relationship` | No | - |
| `status` | `select` | No | - |

#### Required Fields

- `title`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Details.featuredImage` | `upload` | No | `media-assets` |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

