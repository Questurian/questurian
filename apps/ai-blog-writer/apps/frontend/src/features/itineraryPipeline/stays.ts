import type { StayDraft } from './types'

/** How stays are said, and what is worth fixing about them. */

function nightWords(stay: StayDraft): string {
  return stay.firstNight === stay.lastNight
    ? `night ${stay.firstNight}`
    : `nights ${stay.firstNight}–${stay.lastNight}`
}

export function stayLabel(stay: StayDraft): string {
  if (stay.mode === 'recommend') return 'A stay to be recommended'
  return stay.name || 'No hotel chosen yet'
}

/** What is worth fixing, in words. None of it blocks anything. */
export function stayIssues(stays: StayDraft[], dayCount: number): string[] {
  const issues: string[] = []
  const nights = Math.max(dayCount, 1)
  for (const stay of stays) {
    if (stay.firstNight > stay.lastNight) {
      issues.push(`A stay ends before it starts (${nightWords(stay)}).`)
    }
    if (stay.lastNight > nights) {
      issues.push(`“${stayLabel(stay)}” runs past the end of the trip.`)
    }
    if (stay.mode === 'location_manager' && !stay.name.trim()) {
      issues.push('A stay has no hotel chosen yet.')
    }
  }
  for (let night = 1; night <= nights; night += 1) {
    const covering = stays.filter(stay => stay.firstNight <= night && night <= stay.lastNight)
    if (covering.length > 1) {
      issues.push(`Night ${night} has ${covering.length} stays; the first one is used.`)
    }
  }
  return issues
}
