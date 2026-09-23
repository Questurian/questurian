/**
 * How a page is recognised as one permitted version of itself, and the loop
 * that waits for every affected page to reach the new one (surge plan L09).
 *
 * Pure: pages are handed in, time is handed in. `publication-checks.ts` runs
 * these against the real stack; `harness.test.ts` runs them against made-up
 * pages to show each one fails when it should — a correct title with the
 * wrong body, a path that never converges, member text shown after gating.
 */

export type Page = { status: number; html: string; location: string | null }

/**
 * What a reader sees: the document without `<head>` (title, Open Graph) and
 * without scripts (the RSC payload, JSON-LD). An article's SEO title is its
 * own field and keeps its old text after a rename, by design; checking the
 * whole document would call every renamed page "mixed". Privacy checks do
 * not use this — for member text, any appearance anywhere is a leak.
 */
export function visible(html: string): string {
  return html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '')
}

/** Old or new body revision, under an unchanged title. Anything else is forbidden. */
export function revisionState(page: Page, markers: { title: string; oldBody: string; newBody: string }): 'old' | 'new' | null {
  if (page.status !== 200 || !page.html.includes(markers.title)) return null
  const old = page.html.includes(markers.oldBody)
  const fresh = page.html.includes(markers.newBody)
  if (old && !fresh) return 'old'
  if (fresh && !old) return 'new'
  return null
}

/** Old or new title as shown to a reader, with the page's own body intact. */
export function renameState(page: Page, markers: { oldTitle: string; newTitle: string; body?: string }): 'old' | 'new' | null {
  if (page.status !== 200) return null
  if (markers.body && !page.html.includes(markers.body)) return null
  const shown = visible(page.html)
  const old = shown.includes(`${markers.oldTitle} `)
  const fresh = shown.includes(markers.newTitle)
  if (old && !fresh) return 'old'
  if (fresh && !old) return 'new'
  return null
}

/**
 * Free (the whole old page) or gated (the paywall). The member-only text
 * added in the same save must never appear, in any state, anywhere in the
 * document — that is the one thing no eventual-consistency window excuses.
 */
export function gatingState(page: Page, markers: { body: string; memberOnly: string }): 'free' | 'gated' | null {
  if (page.html.includes(markers.memberOnly)) return null
  if (page.status !== 200 || !page.html.includes(markers.body)) return null
  return page.html.includes('data-paywalled') ? 'gated' : 'free'
}

/** Present with its body, or gone. */
export function presenceState(page: Page, markers: { body: string }): 'present' | 'gone' | null {
  if (page.status === 404) return 'gone'
  return page.status === 200 && page.html.includes(markers.body) ? 'present' : null
}

export type Observation = { at: number; path: string; status: number; state: string }
export type Convergence = { ok: boolean; detail: string; convergedMs: number | null; observations: number; timeline: Observation[] }

export async function converge(options: {
  paths: string[]
  fetchPage: (path: string) => Promise<Page>
  classify: (path: string, page: Page) => string | null
  done: (state: string) => boolean
  deadlineMs: number
  pollMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): Promise<Convergence> {
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  const started = now()
  const timeline: Observation[] = []
  const settled = new Set<string>()
  let observations = 0

  while (now() - started < options.deadlineMs) {
    for (const path of options.paths) {
      if (settled.has(path)) continue
      const page = await options.fetchPage(path)
      const state = options.classify(path, page)
      observations += 1
      const last = timeline.filter((entry) => entry.path === path).at(-1)
      if (!last || last.state !== (state ?? 'FORBIDDEN')) {
        timeline.push({ at: now() - started, path, status: page.status, state: state ?? 'FORBIDDEN' })
      }
      if (state === null) {
        return { ok: false, detail: `${path} showed a state no permitted version explains (HTTP ${page.status})`, convergedMs: null, observations, timeline }
      }
      if (options.done(state)) settled.add(path)
    }
    if (settled.size === options.paths.length) {
      return { ok: true, detail: `converged on ${options.paths.length} path(s)`, convergedMs: now() - started, observations, timeline }
    }
    await sleep(options.pollMs)
  }

  return {
    ok: false,
    detail: `did not converge within ${options.deadlineMs / 1000}s: ${options.paths.filter((path) => !settled.has(path)).join(', ')} still old`,
    convergedMs: null,
    observations,
    timeline,
  }
}
