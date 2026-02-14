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
| `tab:Basic Info.type` | `select` | No | Type of establishment |
| `tab:Basic Info.priceLevel` | `select` | No | Price range indicator ($, $$, $$$, $$$$) |
| `tab:Basic Info.gallery` | `array` | No | - |
| `tab:Basic Info.gallery.image` | `relationship` | Yes | - |
| `tab:Basic Info.gallery.altText` | `text` | No | - |
| `tab:Basic Info.gallery.caption` | `text` | No | - |
| `tab:Basic Info.gallery.preview` | `ui` | No | - |
| `tab:Basic Info.instagramGallery` | `array` | No | Instagram posts gallery |
| `tab:Basic Info.instagramGallery.post` | `relationship` | No | - |
| `tab:Basic Info.instagramGallery.preview` | `ui` | No | - |
| `tab:Classification.cuisines` | `json` | No | String[] cuisines |
| `tab:Classification.idealFor` | `json` | No | String[] ideal-for tags |
| `tab:Classification.Location Manager Enrichment` | `collapsible` | No | - |
| `tab:Location & Contact.location` | `text` | No | Location picker |
| `tab:Location & Contact.locationRef` | `relationship` | No | - |
| `tab:Location & Contact.Contact Information` | `collapsible` | No | - |
| `tab:Location & Contact.address` | `text` | No | Google Maps URL |
| `tab:Location & Contact.[row]` | `row` | No | - |
| `tab:Location & Contact.countryCode` | `select` | No | Country Code |
| `tab:Location & Contact.phoneNumber` | `text` | No | Contact phone number |
| `tab:Location & Contact.website` | `text` | No | Website URL |
| `tab:Location & Contact.email` | `email` | No | Contact email |
| `tab:Location & Contact.operationHours` | `json` | No | Structured operation hours |
| `tab:Location & Contact.ianaTimeId` | `text` | No | IANA timezone |
| `tab:Location & Contact.Coordinates` | `collapsible` | No | - |
| `tab:Location & Contact.[row]` | `row` | No | - |
| `tab:Location & Contact.latitude` | `number` | No | - |
| `tab:Location & Contact.longitude` | `number` | No | - |
| `createdBy` | `relationship` | No | - |
| `status` | `select` | No | - |

#### Required Fields

- `title`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Basic Info.gallery.image` | `relationship` | No | `media-sets` |
| `tab:Basic Info.instagramGallery.post` | `relationship` | No | `instagram-posts` |
| `tab:Location & Contact.locationRef` | `relationship` | No | `locations` |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

