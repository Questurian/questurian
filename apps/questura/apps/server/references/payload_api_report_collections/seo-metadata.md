# Collection API Report: `seo-metadata`

- Source: `references/payload_api_report.md`
- Collection: `seo-metadata`

### `seo-metadata`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/seo-metadata` |
| `findByID` | `GET` | `https://example.com/api/seo-metadata/:id` |
| `count` | `GET` | `https://example.com/api/seo-metadata/count` |
| `create` | `POST` | `https://example.com/api/seo-metadata` |
| `update` | `PATCH` | `https://example.com/api/seo-metadata/:id` |
| `delete` | `DELETE` | `https://example.com/api/seo-metadata/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `Basic SEO` | `collapsible` | No | - |
| `metaTitle` | `text` | No | - |
| `metaDescription` | `textarea` | No | - |
| `keywords` | `text` | No | - |
| `Social Media (Open Graph)` | `collapsible` | No | - |
| `ogTitle` | `text` | No | - |
| `ogDescription` | `textarea` | No | - |
| `ogImage` | `upload` | No | - |
| `Advanced SEO` | `collapsible` | No | - |
| `canonicalUrl` | `text` | No | - |
| `noIndex` | `checkbox` | No | - |
| `noFollow` | `checkbox` | No | - |
| `createdBy` | `relationship` | No | - |
| `status` | `select` | No | - |

#### Required Fields

- None

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `ogImage` | `upload` | No | `media-assets` |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

