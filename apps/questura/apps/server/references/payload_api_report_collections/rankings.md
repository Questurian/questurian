# Collection API Report: `rankings`

- Source: `references/payload_api_report.md`
- Collection: `rankings`

### `rankings`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/rankings` |
| `findByID` | `GET` | `https://example.com/api/rankings/:id` |
| `count` | `GET` | `https://example.com/api/rankings/count` |
| `create` | `POST` | `https://example.com/api/rankings` |
| `update` | `PATCH` | `https://example.com/api/rankings/:id` |
| `delete` | `DELETE` | `https://example.com/api/rankings/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `step1_complete` | `checkbox` | No | - |
| `in_update_mode` | `checkbox` | No | - |
| `location_finalized` | `checkbox` | No | - |
| `slug` | `text` | No | - |
| `title` | `text` | Yes | - |
| `location` | `text` | Yes | - |
| `locationRef` | `relationship` | No | - |
| `rankingType` | `select` | Yes | - |
| `step1_ui_wrapper` | `text` | No | - |
| `header` | `group` | No | - |
| `header.featuredImage` | `upload` | No | - |
| `header.intro` | `richText` | No | - |
| `items` | `blocks` | No | Block array. Allowed blockType values: `data-dining`, `data-accommodations`, `data-attractions`, `data-nightlife` |
| `items[data-dining].item` | `relationship` | Yes | - |
| `items[data-dining].selectedGalleryIndices` | `json` | No | - |
| `items[data-dining].selectedInstagramIndex` | `number` | No | - |
| `items[data-dining].perfectFor` | `relationship` | No | - |
| `items[data-dining].content` | `richText` | Yes | - |
| `items[data-accommodations].item` | `relationship` | Yes | - |
| `items[data-accommodations].selectedGalleryIndices` | `json` | No | - |
| `items[data-accommodations].selectedInstagramIndex` | `number` | No | - |
| `items[data-accommodations].perfectFor` | `relationship` | No | - |
| `items[data-accommodations].content` | `richText` | Yes | - |
| `items[data-attractions].item` | `relationship` | Yes | - |
| `items[data-attractions].selectedGalleryIndices` | `json` | No | - |
| `items[data-attractions].selectedInstagramIndex` | `number` | No | - |
| `items[data-attractions].perfectFor` | `relationship` | No | - |
| `items[data-attractions].content` | `richText` | Yes | - |
| `items[data-nightlife].item` | `relationship` | Yes | - |
| `items[data-nightlife].selectedGalleryIndices` | `json` | No | - |
| `items[data-nightlife].selectedInstagramIndex` | `number` | No | - |
| `items[data-nightlife].perfectFor` | `relationship` | No | - |
| `items[data-nightlife].content` | `richText` | Yes | - |
| `seoSection` | `group` | No | - |
| `seoSection.seo` | `relationship` | No | - |
| `status` | `select` | No | - |
| `author` | `relationship` | Yes | - |

#### Required Fields

- `title`
- `location`
- `rankingType`
- `items[data-dining].item`
- `items[data-dining].content`
- `items[data-accommodations].item`
- `items[data-accommodations].content`
- `items[data-attractions].item`
- `items[data-attractions].content`
- `items[data-nightlife].item`
- `items[data-nightlife].content`
- `author`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `locationRef` | `relationship` | No | `locations` |
| `header.featuredImage` | `upload` | No | `media-assets` |
| `items[data-dining].item` | `relationship` | No | `dining` |
| `items[data-dining].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[data-accommodations].item` | `relationship` | No | `accommodations` |
| `items[data-accommodations].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[data-attractions].item` | `relationship` | No | `attractions` |
| `items[data-attractions].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[data-nightlife].item` | `relationship` | No | `nightlife` |
| `items[data-nightlife].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `seoSection.seo` | `relationship` | No | `seo-metadata` |
| `author` | `relationship` | No | `users` |

#### Block Definitions

- Field `items` accepts block objects with required `blockType` values: `data-dining`, `data-accommodations`, `data-attractions`, `data-nightlife`.
- Each block object may include optional `blockName` plus the fields defined below.

  - Block `data-dining`

    | Field | Type | Required |
    | --- | --- | --- |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `data-dining`: `item`, `content`

  - Block `data-accommodations`

    | Field | Type | Required |
    | --- | --- | --- |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `data-accommodations`: `item`, `content`

  - Block `data-attractions`

    | Field | Type | Required |
    | --- | --- | --- |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `data-attractions`: `item`, `content`

  - Block `data-nightlife`

    | Field | Type | Required |
    | --- | --- | --- |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `data-nightlife`: `item`, `content`

