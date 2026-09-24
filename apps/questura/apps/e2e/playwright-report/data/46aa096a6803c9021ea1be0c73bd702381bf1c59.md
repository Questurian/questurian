# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session.spec.ts >> page JavaScript cannot read the session
- Location: tests/session.spec.ts:19:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[name=password]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e8]:
        - button "Open menu modal" [ref=e10] [cursor=pointer]
        - link "Questurian" [ref=e17] [cursor=pointer]:
          - /url: /
        - generic [ref=e20]:
          - link [ref=e21] [cursor=pointer]:
            - /url: /join
            - 'button "Subscribe: under $1.55/wk" [ref=e22]'
          - button "Sign in" [ref=e25] [cursor=pointer]
    - generic [ref=e30]:
      - button "Return" [ref=e32] [cursor=pointer]
      - generic [ref=e37]:
        - heading "Sign In To Questurian" [level=3] [ref=e38]
        - paragraph [ref=e39]: Don’t have an account yet? We’ll use the email address you enter to set one up for you.
        - generic [ref=e41]:
          - generic [ref=e44]:
            - heading "Sign in failed" [level=3] [ref=e45]
            - list [ref=e47]:
              - listitem [ref=e48]: Service is unavailable. Please try again later.
          - generic [ref=e49]:
            - generic [ref=e51]:
              - generic [ref=e52] [cursor=pointer]: Email
              - textbox "Email" [ref=e53]:
                - /placeholder: Email address
                - text: member-a@example.com
            - button "Continue" [ref=e55] [cursor=pointer]
            - generic [ref=e56]:
              - generic [ref=e57]: Or continue with
              - button "Sign in with Google" [ref=e63] [cursor=pointer]
    - main [ref=e69]:
      - article [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e72]:
            - generic [ref=e74]:
              - generic [ref=e75]:
                - navigation "Breadcrumb" [ref=e76]:
                  - list [ref=e77]:
                    - listitem [ref=e78]:
                      - link "Zz Launch" [ref=e79] [cursor=pointer]:
                        - /url: /zz-launch
                    - listitem [ref=e80]:
                      - generic [aria-hidden] [ref=e81]: ›
                      - link "Harbor" [ref=e82] [cursor=pointer]:
                        - /url: /zz-launch/harbor
                    - listitem [ref=e83]:
                      - generic [aria-hidden] [ref=e84]: ›
                      - generic [ref=e85]: Food And Drink
                - paragraph [ref=e86]:
                  - text: By
                  - link "Readiness Admin" [ref=e87] [cursor=pointer]:
                    - /url: /authors/readiness-admin
                  - text: • September 23, 2026
              - heading "LM-ART-00 Harbor Harbor lane bridge square ferry" [level=1] [ref=e88]
              - paragraph [ref=e90]: "LM-ART-00: Wine balcony mill bread evening cathedral tram fishermen vendor stair light arch terrace courtyard."
              - generic [ref=e91]:
                - generic [ref=e92]:
                  - button "Share article" [ref=e94] [cursor=pointer]: Share
                  - button "Bookmark" [ref=e102] [cursor=pointer]
                - button "Add Us On Google" [ref=e106] [cursor=pointer]
            - generic [ref=e112]:
              - figure "Launchland view 1" [ref=e113]:
                - img "Launchland view 1" [ref=e115]
              - generic [ref=e118]:
                - paragraph [ref=e120]: BODY-ART-00-R1 Harbor lane bridge square ferry supper window meadow stall quiet hill gallery tide bakery path morning stone garden fountain dock wine balcony mill bread evening cathedral tram fishermen vendor stair light arch terrace courtyard lighthouse olive tile wheel coffee walk bell station lantern shade orchard market river view museum wind salt mosaic harbor lane bridge square ferry supper window meadow.
                - complementary [ref=e121]:
                  - paragraph [ref=e123]: Advertisement
                  - generic [ref=e125]: Ad space
                - paragraph [ref=e128]: Wind salt mosaic harbor lane bridge square ferry supper window meadow stall quiet hill gallery tide bakery path morning stone garden fountain dock wine balcony mill bread evening cathedral tram fishermen vendor stair light arch terrace courtyard lighthouse olive tile wheel coffee walk bell station lantern shade orchard market river view museum wind salt mosaic.
                - generic [ref=e129]:
                  - paragraph [ref=e130]: Harbor lane bridge square ferry supper window meadow stall quiet hill gallery tide bakery path morning stone garden fountain dock wine balcony mill bread evening cathedral tram fishermen vendor stair light arch terrace courtyard lighthouse olive tile wheel coffee walk bell station lantern shade orchard market river view museum wind salt mosaic harbor lane bridge square ferry supper window meadow stall quiet hill gallery tide bakery path morning stone garden.
                  - paragraph [ref=e131]: Wheel coffee walk bell station lantern shade orchard market river view museum wind salt mosaic harbor lane bridge square ferry supper window meadow stall quiet hill gallery tide bakery path morning stone garden fountain dock wine balcony mill bread evening cathedral tram fishermen vendor stair light arch terrace courtyard lighthouse olive tile wheel coffee walk bell station lantern shade orchard market river view museum.
                - complementary "Members-only content" [ref=e132]:
                  - generic [ref=e133]: Members only
                  - paragraph [ref=e137]: You're reading the first 2 of 12 sections.
                  - paragraph [ref=e138]: Join to unlock the rest of this and everything else on Questurian.
                  - link "Unlock the full guide" [ref=e139] [cursor=pointer]:
                    - /url: /join?returnTo=%2Fzz-launch%2Fharbor%2Ffood-and-drink%2Flaunch-article-00
                  - paragraph [ref=e140]:
                    - text: Already a member?
                    - link "Sign in" [ref=e141] [cursor=pointer]:
                      - /url: /join?returnTo=%2Fzz-launch%2Fharbor%2Ffood-and-drink%2Flaunch-article-00
            - generic [ref=e143]:
              - generic [ref=e145]:
                - generic [ref=e146]:
                  - paragraph [ref=e147]: Advertisement
                  - generic [ref=e149]: Ad space
                - generic [ref=e150]:
                  - paragraph [ref=e151]: Advertisement
                  - generic [ref=e153]: Ad space
              - region [ref=e155]:
                - heading "Trending News" [level=2] [ref=e156]
                - list [ref=e157]:
                  - listitem [ref=e158]:
                    - link [ref=e159] [cursor=pointer]:
                      - /url: /zz-launch/harbor/food-and-drink/launch-article-24
                      - img "Launchland view 1" [ref=e161]
                      - paragraph [ref=e162]: LM-ART-24 Harbor Terrace courtyard lighthouse olive tile
                  - listitem [ref=e163]:
                    - link [ref=e164] [cursor=pointer]:
                      - /url: /zz-launch/harbor/culture/launch-article-20
                      - img "Launchland view 5" [ref=e166]
                      - paragraph [ref=e167]: LM-ART-20 Harbor Orchard market river view museum
                  - listitem [ref=e168]:
                    - link [ref=e169] [cursor=pointer]:
                      - /url: /zz-launch/harbor/neighbourhoods/launch-article-16
                      - img "Launchland view 1" [ref=e171]
                      - paragraph [ref=e172]: LM-ART-16 Harbor Ferry supper window meadow stall
                  - listitem [ref=e173]:
                    - link [ref=e174] [cursor=pointer]:
                      - /url: /zz-launch/harbor/food-and-drink/launch-article-12
                      - img "Launchland view 5" [ref=e176]
                      - paragraph [ref=e177]: LM-ART-12 Harbor Stone garden fountain dock wine
                  - listitem [ref=e178]:
                    - link [ref=e179] [cursor=pointer]:
                      - /url: /zz-launch/harbor/culture/launch-article-08
                      - img "Launchland view 1" [ref=e181]
                      - paragraph [ref=e182]: LM-ART-08 Harbor Vendor stair light arch terrace
          - region [ref=e184]:
            - heading "From Our Partners" [level=2] [ref=e185]
            - list [ref=e186]:
              - listitem [ref=e187]:
                - link [ref=e188] [cursor=pointer]:
                  - /url: /zz-launch/old-quarter/neighbourhoods/launch-article-25
                  - img "Launchland view 2" [ref=e190]
                  - paragraph [ref=e191]: LM-ART-25 Old Quarter Stair light arch terrace courtyard
              - listitem [ref=e192]:
                - link [ref=e193] [cursor=pointer]:
                  - /url: /zz-launch/hillside/culture/launch-article-23
                  - img "Launchland view 8" [ref=e195]
                  - paragraph [ref=e196]: LM-ART-23 Hillside Olive tile wheel coffee walk
              - listitem [ref=e197]:
                - link [ref=e198] [cursor=pointer]:
                  - /url: /zz-launch/river-bend/neighbourhoods/launch-article-22
                  - img "Launchland view 7" [ref=e200]
                  - paragraph [ref=e201]: LM-ART-22 River Bend Coffee walk bell station lantern
              - listitem [ref=e202]:
                - link [ref=e203] [cursor=pointer]:
                  - /url: /zz-launch/old-quarter/food-and-drink/launch-article-21
                  - img "Launchland view 6" [ref=e205]
                  - paragraph [ref=e206]: LM-ART-21 Old Quarter Station lantern shade orchard market
              - listitem [ref=e207]:
                - link [ref=e208] [cursor=pointer]:
                  - /url: /zz-launch/hillside/neighbourhoods/launch-article-19
                  - img "Launchland view 4" [ref=e210]
                  - paragraph [ref=e211]: LM-ART-19 Hillside View museum wind salt mosaic
    - contentinfo [ref=e212]:
      - generic [ref=e213]:
        - link "Questurian" [ref=e215] [cursor=pointer]:
          - /url: /
        - generic [ref=e218]:
          - navigation [ref=e219]:
            - link "Home" [ref=e220] [cursor=pointer]:
              - /url: /
            - link "Subscribe" [ref=e221] [cursor=pointer]:
              - /url: /join
          - paragraph [ref=e222]: © 2026 Questurian. All rights reserved.
  - status [ref=e223]
  - alert [ref=e224]
```

# Test source

```ts
  1  | import { expect, test as base, type Page } from '@playwright/test'
  2  | 
  3  | /**
  4  |  * Who signs in, and what they should see. Defaults are the readiness
  5  |  * sandbox's synthetic readers (`server/scripts/readiness/launch-corpus.ts`);
  6  |  * launch day overrides them with a dedicated account.
  7  |  */
  8  | export const ACCOUNTS = {
  9  |   member: {
  10 |     email: process.env.E2E_MEMBER_EMAIL ?? 'member-a@example.com',
  11 |     password: process.env.E2E_MEMBER_PASSWORD ?? 'Readiness-Synthetic-2026!',
  12 |   },
  13 |   nonmember: {
  14 |     email: process.env.E2E_NONMEMBER_EMAIL ?? 'nonmember@example.com',
  15 |     password: process.env.E2E_NONMEMBER_PASSWORD ?? 'Readiness-Synthetic-2026!',
  16 |   },
  17 | }
  18 | 
  19 | export const MEMBER_ARTICLE = {
  20 |   path: process.env.E2E_MEMBER_ARTICLE ?? '/zz-launch/harbor/food-and-drink/launch-article-00',
  21 |   /** Text only a member sees. The sandbox seeds a marker; launch day passes one. */
  22 |   memberOnlyText: process.env.E2E_MEMBER_TEXT ?? 'MEMBERONLY-ART-00',
  23 | }
  24 | 
  25 | export const SANDBOX = !process.env.E2E_BASE_URL
  26 | 
  27 | let caller = 0
  28 | 
  29 | export const test = base.extend<{ page: Page }>({
  30 |   page: async ({ page }, use) => {
  31 |     // In the sandbox every browser request comes from 127.0.0.1, so all tests
  32 |     // would share one sign-in budget. The proxy header gives each test its
  33 |     // own caller, the way distinct visitors arrive through Cloudflare. Added
  34 |     // at the network layer, after the browser's CORS decision. Never on the
  35 |     // real site: there Cloudflare overwrites it anyway.
  36 |     if (SANDBOX) {
  37 |       caller += 1
  38 |       const address = `198.18.${100 + Math.floor(caller / 250)}.${(caller % 250) + 1}`
  39 |       await page.route('**/api/**', (route) =>
  40 |         route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': address } }),
  41 |       )
  42 |     }
  43 |     await use(page)
  44 |   },
  45 | })
  46 | 
  47 | export { expect }
  48 | 
  49 | export async function signIn(page: Page, account: { email: string; password: string }) {
  50 |   await page.getByRole('button', { name: 'Sign in' }).first().click()
  51 |   await page.locator('input[name=email]').fill(account.email)
  52 |   await page.getByRole('button', { name: /continue/i }).click()
> 53 |   await page.locator('input[name=password]').fill(account.password)
     |                                              ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  54 |   await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  55 | }
  56 | 
  57 | export async function expectSignedIn(page: Page) {
  58 |   await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first()).toBeVisible()
  59 | }
  60 | 
  61 | export async function signOut(page: Page) {
  62 |   await page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first().click()
  63 |   await page.getByRole('button', { name: 'Logout' }).or(page.getByRole('link', { name: 'Logout' })).first().click()
  64 | }
  65 | 
```