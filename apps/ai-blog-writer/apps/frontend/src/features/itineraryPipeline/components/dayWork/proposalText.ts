import type {
  DaySelection,
  DayStayView,
  ResearchView,
  SelectionJourney,
  StayEndView,
} from '../../dayWork/types'

/**
 * How the day's work is said in words. Plain functions, kept apart from the
 * components that show them.
 */

export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const MODE_WORDS: Record<string, string> = {
  walk: 'walk',
  public_transport: 'by public transport',
  taxi: 'by taxi',
  car: 'by car',
  train: 'by train',
  bus: 'by bus',
  unspecified: 'to get there',
}

export function journeyWords(leg: SelectionJourney): string {
  const mode = MODE_WORDS[leg.mode] ?? leg.mode
  if (leg.minutes === null) return leg.note || `Journey ${mode}: not estimated`
  return `About ${leg.minutes} min ${mode} (estimate)`
}

function stayName(view: StayEndView | null): string {
  if (!view) return ''
  if (view.resolved) return view.area ? `${view.name}, ${view.area}` : view.name
  return 'a stay to be recommended'
}

/** The stay line for a day: once, compactly. */
export function stayWords(stay: DayStayView | null | undefined, chosen?: DaySelection['stay']): string {
  if (!stay) return ''
  const fill = (view: StayEndView | null) =>
    view && !view.resolved && chosen?.name ? { ...view, name: chosen.name, area: chosen.area, resolved: true } : view
  const start = fill(stay.start)
  const end = fill(stay.end)
  if (!start && !end) return ''
  if (start && end && start.id === end.id) return `Staying at ${stayName(start)}`
  const parts: string[] = []
  if (start) parts.push(`Starts from ${stayName(start)}`)
  if (end) parts.push(`sleeps at ${stayName(end)}`)
  else if (stay.final_day) parts.push('ends with departure')
  return parts.join(' · ')
}

export function whenWords(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function elapsed(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}

/** What a finished run did, in one line, with unknowns said as unknown. */
export function runSummary(research: ResearchView): string {
  const parts: string[] = [`Chosen on ${research.model || 'Claude'}`]
  const took = elapsed(research.duration_ms)
  if (took) parts.push(took)
  if (research.searches == null || research.fetches == null) {
    parts.push('searches unknown')
  } else {
    parts.push(`${research.searches} searches, ${research.fetches} pages read`)
  }
  if (research.cost_usd !== null) parts.push(`about $${research.cost_usd.toFixed(2)}`)
  return parts.join(' · ')
}
