import { test } from './fixtures'
import { browseJourney } from './journeys'

/**
 * Journey 1 (launch fix plan item 8): a reader browses from the front page to
 * a city, an article and its author, then comes back. Read-only, so it also
 * runs against the real site. The phone projects run it too (journey 11).
 */

test('journey 1: home → city → article → author → back, every page whole and every image decoding', async ({ page }) => {
  await browseJourney(page)
})
