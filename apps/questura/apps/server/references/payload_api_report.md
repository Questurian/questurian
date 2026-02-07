# Payload CMS REST API Report

- Schema source: `./payload_schema.json`
- REST base: `https://example.com/api`
- Generated: `2026-02-07T05:19:50.629Z`

## Collection Reports

### `users`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/users` |
| `findByID` | `GET` | `https://example.com/api/users/:id` |
| `count` | `GET` | `https://example.com/api/users/count` |
| `create` | `POST` | `https://example.com/api/users` |
| `update` | `PATCH` | `https://example.com/api/users/:id` |
| `delete` | `DELETE` | `https://example.com/api/users/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `role` | `select` | Yes | - |
| `tab:Basic Info.email` | `email` | Yes | - |
| `tab:Basic Info.[row]` | `row` | No | - |
| `tab:Basic Info.firstName` | `text` | No | - |
| `tab:Basic Info.lastName` | `text` | No | - |
| `tab:Authentication.authProvider` | `select` | No | - |
| `tab:Authentication.[row]` | `row` | No | - |
| `tab:Authentication.hasLocalPassword` | `checkbox` | No | - |
| `tab:Authentication.hasGoogleOAuth` | `checkbox` | No | - |
| `tab:Authentication.oauthId` | `text` | No | - |
| `tab:Authentication.[row]` | `row` | No | - |
| `tab:Authentication.passwordSetAt` | `date` | No | - |
| `tab:Authentication.googleLinkedAt` | `date` | No | - |
| `tab:Authentication.tokenVersion` | `number` | Yes | - |
| `tab:Authentication.Password Change` | `collapsible` | No | - |
| `tab:Authentication.passwordChangeCode` | `text` | No | - |
| `tab:Authentication.passwordChangeExpires` | `date` | No | - |
| `tab:Authentication.Email Change` | `collapsible` | No | - |
| `tab:Authentication.emailChangeCode` | `text` | No | - |
| `tab:Authentication.emailChangeExpires` | `date` | No | - |
| `tab:Authentication.pendingEmail` | `email` | No | - |
| `tab:Authentication.Email Verification` | `collapsible` | No | - |
| `tab:Authentication.emailVerified` | `checkbox` | No | - |
| `tab:Authentication.emailVerificationCode` | `text` | No | - |
| `tab:Authentication.emailVerificationExpires` | `date` | No | - |
| `tab:Authentication.Password Reset` | `collapsible` | No | - |
| `tab:Authentication.passwordResetCode` | `text` | No | - |
| `tab:Authentication.passwordResetExpires` | `date` | No | - |
| `tab:Membership.subscriptionStatus` | `select` | No | - |
| `tab:Membership.Subscription Timing` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.subscriptionRenewsAt` | `date` | No | - |
| `tab:Membership.membershipExpiration` | `date` | No | - |
| `tab:Membership.cancelAtPeriodEnd` | `checkbox` | No | - |
| `tab:Membership.Stripe Integration` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.stripeCustomerId` | `text` | No | - |
| `tab:Membership.stripeSubscriptionId` | `text` | No | - |
| `tab:Membership.Affiliate Tracking (Referred User)` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.affiliateReferralId` | `text` | No | - |
| `tab:Membership.affiliateReferredAt` | `date` | No | - |
| `tab:Activity.createdAt` | `date` | No | - |
| `tab:Activity.updatedAt` | `date` | No | - |
| `tab:Public Profile.publicProfile` | `group` | No | - |
| `tab:Public Profile.publicProfile.avatar` | `upload` | No | - |
| `tab:Public Profile.publicProfile.isPublic` | `checkbox` | No | - |
| `tab:Public Profile.publicProfile.displayName` | `text` | No | - |
| `tab:Public Profile.publicProfile.bio` | `textarea` | No | - |
| `tab:Public Profile.publicProfile.expertise` | `array` | No | - |
| `tab:Public Profile.publicProfile.expertise.area` | `text` | Yes | - |
| `tab:Public Profile.publicProfile.socialLinks` | `group` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.instagram` | `text` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.twitter` | `text` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.website` | `text` | No | - |

#### Required Fields

- `role`
- `tab:Basic Info.email`
- `tab:Authentication.tokenVersion`
- `tab:Public Profile.publicProfile.expertise.area`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Public Profile.publicProfile.avatar` | `upload` | No | `media-assets` |

#### Block Definitions

- None

---

### `media-assets`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/media-assets` |
| `findByID` | `GET` | `https://example.com/api/media-assets/:id` |
| `count` | `GET` | `https://example.com/api/media-assets/count` |
| `create` | `POST` | `https://example.com/api/media-assets` |
| `update` | `PATCH` | `https://example.com/api/media-assets/:id` |
| `delete` | `DELETE` | `https://example.com/api/media-assets/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user` | `relationship` | No | - |
| `uploadedBy` | `text` | No | - |
| `mediaSet` | `relationship` | No | - |
| `variant` | `select` | No | - |
| `alt_text` | `text` | No | - |
| `photographer_credit` | `text` | No | - |
| `location` | `text` | No | - |
| `locationRef` | `relationship` | No | - |
| `location_finalized` | `checkbox` | No | - |
| `tags` | `relationship` | No | - |

#### Required Fields

- None

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `user` | `relationship` | No | `users` |
| `mediaSet` | `relationship` | No | `media-sets` |
| `locationRef` | `relationship` | No | `locations` |
| `tags` | `relationship` | Yes | `article-tags` |

#### Block Definitions

- None

---

### `media-sets`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/media-sets` |
| `findByID` | `GET` | `https://example.com/api/media-sets/:id` |
| `count` | `GET` | `https://example.com/api/media-sets/count` |
| `create` | `POST` | `https://example.com/api/media-sets` |
| `update` | `PATCH` | `https://example.com/api/media-sets/:id` |
| `delete` | `DELETE` | `https://example.com/api/media-sets/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `text` | Yes | - |
| `alt_text` | `text` | No | - |
| `photographer_credit` | `text` | No | - |
| `variants` | `group` | No | - |
| `variants.thumbnail` | `relationship` | No | - |
| `variants.square` | `relationship` | No | - |
| `variants.wide` | `relationship` | No | - |
| `variants.portrait` | `relationship` | No | - |
| `variants.hero` | `relationship` | No | - |
| `externalRef` | `text` | No | - |
| `status` | `select` | No | - |
| `createdBy` | `relationship` | No | - |
| `location` | `text` | No | - |
| `locationRef` | `relationship` | No | - |
| `location_finalized` | `checkbox` | No | - |
| `tags` | `relationship` | No | - |

#### Required Fields

- `title`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `variants.thumbnail` | `relationship` | No | `media-assets` |
| `variants.square` | `relationship` | No | `media-assets` |
| `variants.wide` | `relationship` | No | `media-assets` |
| `variants.portrait` | `relationship` | No | `media-assets` |
| `variants.hero` | `relationship` | No | `media-assets` |
| `createdBy` | `relationship` | No | `users` |
| `locationRef` | `relationship` | No | `locations` |
| `tags` | `relationship` | Yes | `article-tags` |

#### Block Definitions

- None

---

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

---

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

---

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

---

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

---

### `locations`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/locations` |
| `findByID` | `GET` | `https://example.com/api/locations/:id` |
| `count` | `GET` | `https://example.com/api/locations/count` |
| `create` | `POST` | `https://example.com/api/locations` |
| `update` | `PATCH` | `https://example.com/api/locations/:id` |
| `delete` | `DELETE` | `https://example.com/api/locations/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `level` | `select` | Yes | - |
| `country` | `text` | Yes | - |
| `city` | `text` | No | - |
| `neighborhood` | `text` | No | - |
| `locationKey` | `text` | No | - |
| `parentKey` | `text` | No | - |
| `countryName` | `text` | Yes | - |
| `cityName` | `text` | No | - |
| `neighborhoodName` | `text` | No | - |

#### Required Fields

- `level`
- `country`
- `countryName`

#### Relationship Fields

- None

#### Block Definitions

- None

---

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

---

### `article-categories`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/article-categories` |
| `findByID` | `GET` | `https://example.com/api/article-categories/:id` |
| `count` | `GET` | `https://example.com/api/article-categories/count` |
| `create` | `POST` | `https://example.com/api/article-categories` |
| `update` | `PATCH` | `https://example.com/api/article-categories/:id` |
| `delete` | `DELETE` | `https://example.com/api/article-categories/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `text` | Yes | - |
| `slug` | `text` | No | - |
| `description` | `textarea` | No | - |
| `usageCount` | `number` | No | - |
| `status` | `select` | No | - |
| `createdBy` | `relationship` | No | - |

#### Required Fields

- `name`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

---

### `article-tags`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/article-tags` |
| `findByID` | `GET` | `https://example.com/api/article-tags/:id` |
| `count` | `GET` | `https://example.com/api/article-tags/count` |
| `create` | `POST` | `https://example.com/api/article-tags` |
| `update` | `PATCH` | `https://example.com/api/article-tags/:id` |
| `delete` | `DELETE` | `https://example.com/api/article-tags/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `text` | Yes | - |
| `slug` | `text` | No | - |
| `displayName` | `text` | No | - |
| `description` | `textarea` | No | - |
| `usageCount` | `number` | No | - |
| `status` | `select` | No | - |
| `createdBy` | `relationship` | No | - |

#### Required Fields

- `name`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

---

### `accommodations`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/accommodations` |
| `findByID` | `GET` | `https://example.com/api/accommodations/:id` |
| `count` | `GET` | `https://example.com/api/accommodations/count` |
| `create` | `POST` | `https://example.com/api/accommodations` |
| `update` | `PATCH` | `https://example.com/api/accommodations/:id` |
| `delete` | `DELETE` | `https://example.com/api/accommodations/:id` |

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

---

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

---

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

---

### `nightlife`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/nightlife` |
| `findByID` | `GET` | `https://example.com/api/nightlife/:id` |
| `count` | `GET` | `https://example.com/api/nightlife/count` |
| `create` | `POST` | `https://example.com/api/nightlife` |
| `update` | `PATCH` | `https://example.com/api/nightlife/:id` |
| `delete` | `DELETE` | `https://example.com/api/nightlife/:id` |

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

---

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

---

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

---

### `perfect-for-tags`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/perfect-for-tags` |
| `findByID` | `GET` | `https://example.com/api/perfect-for-tags/:id` |
| `count` | `GET` | `https://example.com/api/perfect-for-tags/count` |
| `create` | `POST` | `https://example.com/api/perfect-for-tags` |
| `update` | `PATCH` | `https://example.com/api/perfect-for-tags/:id` |
| `delete` | `DELETE` | `https://example.com/api/perfect-for-tags/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `text` | Yes | - |
| `slug` | `text` | No | - |
| `category` | `select` | Yes | - |
| `applicableTypes` | `select` | Yes | - |
| `description` | `textarea` | No | - |
| `status` | `select` | No | - |
| `usageCount` | `number` | No | - |
| `createdBy` | `relationship` | No | - |

#### Required Fields

- `label`
- `category`
- `applicableTypes`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `createdBy` | `relationship` | No | `users` |

#### Block Definitions

- None

---

