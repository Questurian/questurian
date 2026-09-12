/**
 * Whether a pasted link is a TripAdvisor page for one place.
 *
 * Checked by shape, not by fetching: the host has to be TripAdvisor (any
 * country's domain -- tripadvisor.com, tripadvisor.com.pe, es.tripadvisor.com)
 * and the path has to carry a place id, the `-d1234567` every restaurant,
 * attraction and hotel page has. That rules out another site, TripAdvisor's
 * home page and its search pages, which are the ways a pasted link is wrong in
 * practice. It cannot say the page is for the RIGHT place; that is the person
 * pasting it.
 */

const TRIPADVISOR_HOST = /(^|\.)tripadvisor\.[a-z]{2,3}(\.[a-z]{2})?$/i
const PLACE_ID = /-d\d{3,}(-|\.|$)/

export function isTripAdvisorPlaceLink(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return TRIPADVISOR_HOST.test(url.hostname) && PLACE_ID.test(url.pathname)
}
