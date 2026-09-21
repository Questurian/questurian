/**
 * The one rule for a server-side public read: a 404 means "there is no such
 * page", and nothing else does.
 *
 * `fetchCityHomepage` returned `null` for every non-OK status, and the city
 * page turns `null` into the flat fallback list or `notFound()`. So a backend
 * timeout, a 500 or an overload 503 during revalidation rendered Lima as a
 * different page — or as a 404 — and ISR cached that for an hour. Throwing
 * instead makes the render fail, which is what keeps a page correct: on
 * revalidation Next keeps serving the last good version, and Next only writes
 * a fetch to its data cache when the response is a 200.
 *
 * Deliberately dependency-free so the client's node:test suite can run it.
 */
export async function readPublicResponse<T>(response: Response, what: string): Promise<T | null> {
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Failed to fetch ${what}: ${response.status}`)
  }
  return (await response.json()) as T
}
