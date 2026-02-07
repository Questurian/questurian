# Collection API Report: `instagram-posts`

- Source: `references/payload_api_report.md`
- Collection: `instagram-posts`

### `instagram-posts`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/instagram-posts` |
| `findByID` | `GET` | `https://example.com/api/instagram-posts/:id` |
| `count` | `GET` | `https://example.com/api/instagram-posts/count` |
| `create` | `POST` | `https://example.com/api/instagram-posts` |
| `update` | `PATCH` | `https://example.com/api/instagram-posts/:id` |
| `delete` | `DELETE` | `https://example.com/api/instagram-posts/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `previewImage` | `upload` | No | - |
| `title` | `text` | Yes | - |
| `embedCode` | `textarea` | Yes | - |
| `status` | `select` | No | - |

#### Required Fields

- `title`
- `embedCode`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `previewImage` | `upload` | No | `media-assets` |

#### Block Definitions

- None

