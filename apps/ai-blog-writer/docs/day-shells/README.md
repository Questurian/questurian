# Lima day shell collection

Eight editable custom layouts saved in the local Day Shell Library. The `Lima ·` prefix identifies geographic scope; general built-ins remain separate by name. This JSON is a portable copy in the existing library API format, not an automatic seed or a second runtime source.

Each slot has an existing moment key plus an editable contextual label. These are planning templates, not verified venue routes. Several moments can happen at one place; a guided interpretation need not mean another journey. Budget travel separately, particularly for Callao and Pachacámac. No new moment vocabulary is required.

To restore a missing layout, POST its object from `lima.json` to `/itineraries-pipeline/day-shells` on the intended local backend. Check existing IDs first; do not overwrite later editor changes blindly.

## Lima · Barranco: Art into After Dark

A Barranco-focused progression from neighborhood art and independent design to the coast, dinner, and live music.

| Stop label | Existing moment |
| --- | --- |
| Breakfast in Barranco | `breakfast` |
| Walk the neighborhood streets | `morning-walk` |
| Read the murals and street art | `culture` |
| Explore a contemporary gallery | `culture` |
| A neighborhood lunch | `lunch` |
| Browse independent designers | `shopping` |
| Pause at a coastal viewpoint | `scenic-viewpoint` |
| Dinner before the music | `dinner` |
| Live music to close the night | `nightlife` |

## Lima · Lima, Layer by Layer

Explore the historic center through civic landmarks, historic interiors, local food, and museum stories. Keep the route within a compact area.

| Stop label | Existing moment |
| --- | --- |
| Coffee near the historic center | `coffee` |
| Start with a historic plaza | `landmark` |
| Read a major architectural landmark | `landmark` |
| Step inside a historic building | `historic-site` |
| Traditional lunch in the center | `lunch` |
| A museum that connects the history | `museum-visit` |
| Browse an old shopping passage | `shopping` |
| Try a traditional sweet | `sweet-treat` |
| An early dinner to finish | `dinner` |

## Lima · Pacific Morning, Limeño Lunch

A coastal day built around one surf lesson and a seafood lunch, with small recovery stops. Allow time to change and travel between beach and clifftop.

| Stop label | Existing moment |
| --- | --- |
| Breakfast before the beach | `breakfast` |
| A surf lesson on the Costa Verde | `active-adventure` |
| Beach cooldown after the lesson | `beach-time` |
| Coffee after changing out of beach gear | `coffee` |
| Ceviche and a relaxed seafood lunch | `lunch` |
| Take in the coast from above | `scenic-viewpoint` |
| An easy coastal park pause | `outdoor` |
| A casual dinner to finish | `dinner` |

## Lima · The Criollo Table

Follow Lima’s criollo food traditions through ingredients, neighborhood heritage, small tastes, and music. Choose a compact route and keep snack portions small.

| Stop label | Existing moment |
| --- | --- |
| A traditional Limeño breakfast | `breakfast` |
| Explore the ingredients at a market | `local-market` |
| A neighborhood heritage stop | `historic-site` |
| A lunch built around criollo cooking | `lunch` |
| A gentle neighborhood park walk | `outdoor` |
| One traditional sweet | `sweet-treat` |
| Explore a living local tradition | `culture` |
| Anticuchos for an informal supper | `street-food` |
| An evening of criollo music | `nightlife` |

## Lima · Ancient Lima, Living City

Connect pre-Hispanic Lima with its present-day neighborhoods. Pair one archaeological anchor with a complementary museum; allow for transfers.

| Stop label | Existing moment |
| --- | --- |
| Breakfast near the archaeological anchor | `breakfast` |
| Explore a pre-Hispanic site | `historic-site` |
| A guided interpretation of the site | `guided-tour` |
| Coffee in the surrounding neighborhood | `coffee` |
| A local lunch between eras | `lunch` |
| A museum that deepens the ancient story | `museum-visit` |
| A garden pause back in the living city | `outdoor` |
| Contemporary Peruvian dinner | `dinner` |

## Lima · Pueblo Libre: Museums & Old Tables

A Pueblo Libre neighborhood day centered on one substantial museum visit, local heritage, traditional food, and a tavern finish.

| Stop label | Existing moment |
| --- | --- |
| Breakfast in Pueblo Libre | `breakfast` |
| Get oriented at a neighborhood plaza | `landmark` |
| The day’s main museum visit | `museum-visit` |
| A traditional neighborhood lunch | `lunch` |
| Explore a neighborhood heritage site | `historic-site` |
| Browse Peruvian artisan work | `shopping` |
| A local sweet and a seated pause | `sweet-treat` |
| Dinner at a traditional tavern | `dinner` |

## Lima · Callao: Port, Art & Sea

A Lima-area day connecting Callao’s port history and art with a coastal finish. Plan transfers between the port/art district and La Punta as needed.

| Stop label | Existing moment |
| --- | --- |
| Breakfast to begin the port day | `breakfast` |
| Discover a maritime-history landmark | `historic-site` |
| Explore the port district’s street art | `culture` |
| Visit a local gallery | `culture` |
| A seafood lunch | `lunch` |
| A gentle coastal walk | `outdoor` |
| Pause over the waterfront view | `scenic-viewpoint` |
| An early coastal dinner | `dinner` |

## Lima · Pachacámac: Sanctuary & Countryside

A southern Lima excursion around the sanctuary and countryside lunch. Reserve time for outbound and return travel; interpretation can share the main site visit.

| Stop label | Existing moment |
| --- | --- |
| Breakfast before the excursion | `breakfast` |
| Get context at the site museum | `museum-visit` |
| Explore the archaeological sanctuary | `historic-site` |
| Interpret the landscape with a guide | `guided-tour` |
| A countryside lunch | `lunch` |
| Discover local craft | `culture` |
| A gentle garden or outdoor pause | `outdoor` |
| Coffee before the journey back | `coffee` |
