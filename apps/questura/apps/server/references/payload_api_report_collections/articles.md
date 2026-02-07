# Collection API Report: `articles`

- Source: `references/payload_api_report.md`
- Collection: `articles`

### `articles`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/articles` |
| `findByID` | `GET` | `https://example.com/api/articles/:id` |
| `count` | `GET` | `https://example.com/api/articles/count` |
| `create` | `POST` | `https://example.com/api/articles` |
| `update` | `PATCH` | `https://example.com/api/articles/:id` |
| `delete` | `DELETE` | `https://example.com/api/articles/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `step1_complete` | `checkbox` | No | - |
| `in_update_mode` | `checkbox` | No | - |
| `title` | `text` | Yes | - |
| `location` | `text` | Yes | - |
| `locationRef` | `relationship` | No | - |
| `step1_ui_wrapper` | `text` | No | - |
| `headerSection` | `group` | No | - |
| `headerSection.featuredImage` | `upload` | Yes | - |
| `contentBlocks` | `blocks` | No | Block array. Allowed blockType values: `text`, `image` |
| `contentBlocks[text].content` | `richText` | Yes | - |
| `contentBlocks[image].image` | `upload` | Yes | - |
| `contentBlocks[image].altText` | `text` | Yes | - |
| `contentBlocks[image].caption` | `text` | No | - |
| `seoSection` | `group` | No | - |
| `seoSection.seo` | `relationship` | No | - |
| `slug` | `text` | No | - |
| `status` | `select` | No | - |
| `author` | `relationship` | Yes | - |
| `publishedAt` | `date` | No | - |
| `category` | `relationship` | No | - |
| `tags` | `relationship` | No | - |

#### Required Fields

- `title`
- `location`
- `headerSection.featuredImage`
- `contentBlocks[text].content`
- `contentBlocks[image].image`
- `contentBlocks[image].altText`
- `author`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `locationRef` | `relationship` | No | `locations` |
| `headerSection.featuredImage` | `upload` | No | `media-assets` |
| `contentBlocks[image].image` | `upload` | No | `media-assets` |
| `seoSection.seo` | `relationship` | No | `seo-metadata` |
| `author` | `relationship` | No | `users` |
| `category` | `relationship` | No | `article-categories` |
| `tags` | `relationship` | Yes | `article-tags` |

#### Block Definitions

- Field `contentBlocks` accepts block objects with required `blockType` values: `text`, `image`.
- Each block object may include optional `blockName` plus the fields defined below.

  - Block `text`

    | Field | Type | Required |
    | --- | --- | --- |
    | `content` | `richText` | Yes |

    Required in `text`: `content`

  - Block `image`

    | Field | Type | Required |
    | --- | --- | --- |
    | `image` | `upload` | Yes |
    | `altText` | `text` | Yes |
    | `caption` | `text` | No |

    Required in `image`: `image`, `altText`

