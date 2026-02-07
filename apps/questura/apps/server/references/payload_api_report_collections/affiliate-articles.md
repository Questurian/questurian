# Collection API Report: `affiliate-articles`

- Source: `references/payload_api_report.md`
- Collection: `affiliate-articles`

### `affiliate-articles`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/affiliate-articles` |
| `findByID` | `GET` | `https://example.com/api/affiliate-articles/:id` |
| `count` | `GET` | `https://example.com/api/affiliate-articles/count` |
| `create` | `POST` | `https://example.com/api/affiliate-articles` |
| `update` | `PATCH` | `https://example.com/api/affiliate-articles/:id` |
| `delete` | `DELETE` | `https://example.com/api/affiliate-articles/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `step1_complete` | `checkbox` | No | - |
| `in_update_mode` | `checkbox` | No | - |
| `title` | `text` | Yes | - |
| `step1UiWrapper` | `ui` | No | - |
| `headerSection` | `group` | No | - |
| `headerSection.featuredImage` | `upload` | Yes | - |
| `headerSection.intro` | `richText` | No | - |
| `items` | `blocks` | No | Block array. Allowed blockType values: `data-affiliate` |
| `items[data-affiliate].item` | `relationship` | Yes | - |
| `items[data-affiliate].content` | `richText` | Yes | - |
| `seoSection` | `group` | No | - |
| `seoSection.seo` | `relationship` | No | - |
| `slug` | `text` | No | - |
| `status` | `select` | No | - |
| `author` | `relationship` | Yes | - |
| `publishedAt` | `date` | No | - |

#### Required Fields

- `title`
- `headerSection.featuredImage`
- `items[data-affiliate].item`
- `items[data-affiliate].content`
- `author`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `headerSection.featuredImage` | `upload` | No | `media-assets` |
| `items[data-affiliate].item` | `relationship` | No | `affiliate-products` |
| `seoSection.seo` | `relationship` | No | `seo-metadata` |
| `author` | `relationship` | No | `users` |

#### Block Definitions

- Field `items` accepts block objects with required `blockType` values: `data-affiliate`.
- Each block object may include optional `blockName` plus the fields defined below.

  - Block `data-affiliate`

    | Field | Type | Required |
    | --- | --- | --- |
    | `item` | `relationship` | Yes |
    | `content` | `richText` | Yes |

    Required in `data-affiliate`: `item`, `content`

