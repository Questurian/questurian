/**
 * The verdict on one page the front-door check loads from the client.
 *
 * Kept apart from `front-door-checks.ts` (which needs a running stack) so the
 * rule is unit-tested. The status must be exactly the one expected. An earlier
 * version accepted HTTP 200 + noindex + Next's streamed not-found marker in
 * place of 404, because the itinerary route's loading.tsx streamed its shell
 * before the page called notFound(). The client now decides existence in the
 * segment's layout, above that boundary, so a missing or draft itinerary is a
 * real 404 and nothing else passes.
 */

export type RenderExpectation = {
  expect: number
  /** Text the page must contain (a published piece's title). */
  marker?: string
  /** Text the page must not contain (a draft's body). */
  absent?: string
}

export type RenderVerdict = {
  ok: boolean
  statusOk: boolean
  markerOk: boolean
  leaked: boolean
  detail: string
}

export function judgeRender(page: RenderExpectation, status: number, html: string): RenderVerdict {
  const statusOk = status === page.expect
  const markerOk = page.marker ? html.includes(page.marker) : true
  const leaked = page.absent ? html.includes(page.absent) : false
  // Named, so a regression to the old streamed not-found reads as what it is.
  const streamedNotFound = page.expect === 404 && status === 200 && html.includes('NEXT_HTTP_ERROR_FALLBACK;404')
  const detail = [
    `HTTP ${status}${streamedNotFound ? ' (streamed not-found: notFound() ran after the shell was sent)' : ''}`,
    ...(page.marker ? [`marker ${markerOk ? 'present' : 'absent'}`] : []),
    ...(leaked ? ['DRAFT CONTENT LEAKED'] : []),
  ].join(', ')
  return { ok: statusOk && markerOk && !leaked, statusOk, markerOk, leaked, detail }
}
