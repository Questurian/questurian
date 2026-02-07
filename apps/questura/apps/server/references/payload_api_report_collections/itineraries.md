# Collection API Report: `itineraries`

- Source: `references/payload_api_report.md`
- Collection: `itineraries`

### `itineraries`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/itineraries` |
| `findByID` | `GET` | `https://example.com/api/itineraries/:id` |
| `count` | `GET` | `https://example.com/api/itineraries/count` |
| `create` | `POST` | `https://example.com/api/itineraries` |
| `update` | `PATCH` | `https://example.com/api/itineraries/:id` |
| `delete` | `DELETE` | `https://example.com/api/itineraries/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `step1_complete` | `checkbox` | No | - |
| `in_update_mode` | `checkbox` | No | - |
| `title` | `text` | Yes | - |
| `location` | `text` | Yes | - |
| `locationRef` | `relationship` | No | - |
| `step1UiWrapper` | `ui` | No | - |
| `headerSection` | `group` | No | - |
| `headerSection.featuredImage` | `upload` | Yes | - |
| `headerSection.intro` | `richText` | No | - |
| `items` | `blocks` | No | Block array. Allowed blockType values: `itinerary-accommodations`, `itinerary-dining`, `itinerary-attractions`, `itinerary-nightlife` |
| `items[itinerary-accommodations].[row]` | `row` | No | - |
| `items[itinerary-accommodations].timeHour` | `number` | Yes | - |
| `items[itinerary-accommodations].timeMinute` | `select` | Yes | - |
| `items[itinerary-accommodations].timePeriod` | `select` | Yes | - |
| `items[itinerary-accommodations].duration` | `row` | No | - |
| `items[itinerary-accommodations].duration.durationHours` | `number` | No | - |
| `items[itinerary-accommodations].duration.durationMinutes` | `select` | No | - |
| `items[itinerary-accommodations].item` | `relationship` | Yes | - |
| `items[itinerary-accommodations].selectedGalleryIndices` | `json` | No | - |
| `items[itinerary-accommodations].selectedInstagramIndex` | `number` | No | - |
| `items[itinerary-accommodations].perfectFor` | `relationship` | No | - |
| `items[itinerary-accommodations].content` | `richText` | Yes | - |
| `items[itinerary-dining].[row]` | `row` | No | - |
| `items[itinerary-dining].timeHour` | `number` | Yes | - |
| `items[itinerary-dining].timeMinute` | `select` | Yes | - |
| `items[itinerary-dining].timePeriod` | `select` | Yes | - |
| `items[itinerary-dining].duration` | `row` | No | - |
| `items[itinerary-dining].duration.durationHours` | `number` | No | - |
| `items[itinerary-dining].duration.durationMinutes` | `select` | No | - |
| `items[itinerary-dining].item` | `relationship` | Yes | - |
| `items[itinerary-dining].selectedGalleryIndices` | `json` | No | - |
| `items[itinerary-dining].selectedInstagramIndex` | `number` | No | - |
| `items[itinerary-dining].perfectFor` | `relationship` | No | - |
| `items[itinerary-dining].content` | `richText` | Yes | - |
| `items[itinerary-attractions].[row]` | `row` | No | - |
| `items[itinerary-attractions].timeHour` | `number` | Yes | - |
| `items[itinerary-attractions].timeMinute` | `select` | Yes | - |
| `items[itinerary-attractions].timePeriod` | `select` | Yes | - |
| `items[itinerary-attractions].duration` | `row` | No | - |
| `items[itinerary-attractions].duration.durationHours` | `number` | No | - |
| `items[itinerary-attractions].duration.durationMinutes` | `select` | No | - |
| `items[itinerary-attractions].item` | `relationship` | Yes | - |
| `items[itinerary-attractions].selectedGalleryIndices` | `json` | No | - |
| `items[itinerary-attractions].selectedInstagramIndex` | `number` | No | - |
| `items[itinerary-attractions].perfectFor` | `relationship` | No | - |
| `items[itinerary-attractions].content` | `richText` | Yes | - |
| `items[itinerary-nightlife].[row]` | `row` | No | - |
| `items[itinerary-nightlife].timeHour` | `number` | Yes | - |
| `items[itinerary-nightlife].timeMinute` | `select` | Yes | - |
| `items[itinerary-nightlife].timePeriod` | `select` | Yes | - |
| `items[itinerary-nightlife].duration` | `row` | No | - |
| `items[itinerary-nightlife].duration.durationHours` | `number` | No | - |
| `items[itinerary-nightlife].duration.durationMinutes` | `select` | No | - |
| `items[itinerary-nightlife].item` | `relationship` | Yes | - |
| `items[itinerary-nightlife].selectedGalleryIndices` | `json` | No | - |
| `items[itinerary-nightlife].selectedInstagramIndex` | `number` | No | - |
| `items[itinerary-nightlife].perfectFor` | `relationship` | No | - |
| `items[itinerary-nightlife].content` | `richText` | Yes | - |
| `seoSection` | `group` | No | - |
| `seoSection.seo` | `relationship` | No | - |
| `slug` | `text` | No | - |
| `status` | `select` | No | - |
| `author` | `relationship` | Yes | - |
| `publishedAt` | `date` | No | - |

#### Required Fields

- `title`
- `location`
- `headerSection.featuredImage`
- `items[itinerary-accommodations].timeHour`
- `items[itinerary-accommodations].timeMinute`
- `items[itinerary-accommodations].timePeriod`
- `items[itinerary-accommodations].item`
- `items[itinerary-accommodations].content`
- `items[itinerary-dining].timeHour`
- `items[itinerary-dining].timeMinute`
- `items[itinerary-dining].timePeriod`
- `items[itinerary-dining].item`
- `items[itinerary-dining].content`
- `items[itinerary-attractions].timeHour`
- `items[itinerary-attractions].timeMinute`
- `items[itinerary-attractions].timePeriod`
- `items[itinerary-attractions].item`
- `items[itinerary-attractions].content`
- `items[itinerary-nightlife].timeHour`
- `items[itinerary-nightlife].timeMinute`
- `items[itinerary-nightlife].timePeriod`
- `items[itinerary-nightlife].item`
- `items[itinerary-nightlife].content`
- `author`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `locationRef` | `relationship` | No | `locations` |
| `headerSection.featuredImage` | `upload` | No | `media-assets` |
| `items[itinerary-accommodations].item` | `relationship` | No | `accommodations` |
| `items[itinerary-accommodations].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[itinerary-dining].item` | `relationship` | No | `dining` |
| `items[itinerary-dining].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[itinerary-attractions].item` | `relationship` | No | `attractions` |
| `items[itinerary-attractions].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `items[itinerary-nightlife].item` | `relationship` | No | `nightlife` |
| `items[itinerary-nightlife].perfectFor` | `relationship` | Yes | `perfect-for-tags` |
| `seoSection.seo` | `relationship` | No | `seo-metadata` |
| `author` | `relationship` | No | `users` |

#### Block Definitions

- Field `items` accepts block objects with required `blockType` values: `itinerary-accommodations`, `itinerary-dining`, `itinerary-attractions`, `itinerary-nightlife`.
- Each block object may include optional `blockName` plus the fields defined below.

  - Block `itinerary-accommodations`

    | Field | Type | Required |
    | --- | --- | --- |
    | `[row]` | `row` | No |
    | `timeHour` | `number` | Yes |
    | `timeMinute` | `select` | Yes |
    | `timePeriod` | `select` | Yes |
    | `duration` | `row` | No |
    | `duration.durationHours` | `number` | No |
    | `duration.durationMinutes` | `select` | No |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `itinerary-accommodations`: `timeHour`, `timeMinute`, `timePeriod`, `item`, `content`

  - Block `itinerary-dining`

    | Field | Type | Required |
    | --- | --- | --- |
    | `[row]` | `row` | No |
    | `timeHour` | `number` | Yes |
    | `timeMinute` | `select` | Yes |
    | `timePeriod` | `select` | Yes |
    | `duration` | `row` | No |
    | `duration.durationHours` | `number` | No |
    | `duration.durationMinutes` | `select` | No |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `itinerary-dining`: `timeHour`, `timeMinute`, `timePeriod`, `item`, `content`

  - Block `itinerary-attractions`

    | Field | Type | Required |
    | --- | --- | --- |
    | `[row]` | `row` | No |
    | `timeHour` | `number` | Yes |
    | `timeMinute` | `select` | Yes |
    | `timePeriod` | `select` | Yes |
    | `duration` | `row` | No |
    | `duration.durationHours` | `number` | No |
    | `duration.durationMinutes` | `select` | No |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `itinerary-attractions`: `timeHour`, `timeMinute`, `timePeriod`, `item`, `content`

  - Block `itinerary-nightlife`

    | Field | Type | Required |
    | --- | --- | --- |
    | `[row]` | `row` | No |
    | `timeHour` | `number` | Yes |
    | `timeMinute` | `select` | Yes |
    | `timePeriod` | `select` | Yes |
    | `duration` | `row` | No |
    | `duration.durationHours` | `number` | No |
    | `duration.durationMinutes` | `select` | No |
    | `item` | `relationship` | Yes |
    | `selectedGalleryIndices` | `json` | No |
    | `selectedInstagramIndex` | `number` | No |
    | `perfectFor` | `relationship` | No |
    | `content` | `richText` | Yes |

    Required in `itinerary-nightlife`: `timeHour`, `timeMinute`, `timePeriod`, `item`, `content`

