# Collection API Report: `attractions`

- Source: `references/payload_api_report.md`
- Collection: `attractions`

### `attractions`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/attractions` |
| `findByID` | `GET` | `https://example.com/api/attractions/:id` |
| `count` | `GET` | `https://example.com/api/attractions/count` |
| `create` | `POST` | `https://example.com/api/attractions` |
| `update` | `PATCH` | `https://example.com/api/attractions/:id` |
| `delete` | `DELETE` | `https://example.com/api/attractions/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `text` | Yes | - |
| `tab:Details.type` | `select` | No | - |
| `tab:Details.gallery` | `array` | No | - |
| `tab:Details.gallery.image` | `relationship` | Yes | - |
| `tab:Details.gallery.preview` | `ui` | No | - |
| `tab:Details.instagramGallery` | `array` | No | - |
| `tab:Details.instagramGallery.post` | `relationship` | No | - |
| `tab:Details.instagramGallery.preview` | `ui` | No | - |
| `tab:Location.location` | `text` | Yes | - |
| `tab:Location.locationRef` | `relationship` | No | - |
| `tab:Location.Contact Information` | `collapsible` | No | - |
| `tab:Location.address` | `text` | No | - |
| `tab:Location.[row]` | `row` | No | - |
| `tab:Location.countryCode` | `select` | No | - |
| `tab:Location.phoneNumber` | `text` | No | - |
| `tab:Location.website` | `text` | No | - |
| `tab:Location.Coordinates` | `collapsible` | No | - |
| `tab:Location.[row]` | `row` | No | - |
| `tab:Location.latitude` | `number` | No | - |
| `tab:Location.longitude` | `number` | No | - |
| `createdBy` | `relationship` | No | - |
| `status` | `select` | No | - |

#### Required Fields

- `title`
- `tab:Details.gallery.image`
- `tab:Location.location`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Details.gallery.image` | `relationship` | No | `media-sets` |
| `tab:Details.instagramGallery.post` | `relationship` | No | `instagram-posts` |
| `tab:Location.locationRef` | `relationship` | No | `locations` |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

