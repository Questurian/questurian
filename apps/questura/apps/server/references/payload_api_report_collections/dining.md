# Collection API Report: `dining`

- Source: `references/payload_api_report.md`
- Collection: `dining`

### `dining`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/dining` |
| `findByID` | `GET` | `https://example.com/api/dining/:id` |
| `count` | `GET` | `https://example.com/api/dining/count` |
| `create` | `POST` | `https://example.com/api/dining` |
| `update` | `PATCH` | `https://example.com/api/dining/:id` |
| `delete` | `DELETE` | `https://example.com/api/dining/:id` |

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
| `tab:Location.location` | `text` | No | - |
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

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Details.gallery.image` | `relationship` | No | `media-sets` |
| `tab:Details.instagramGallery.post` | `relationship` | No | `instagram-posts` |
| `tab:Location.locationRef` | `relationship` | No | `locations` |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

