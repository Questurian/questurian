import type {
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import { buildArticleLocationLabel } from './ai-autowrite.service'
import {
  collectCommittedPlaceTitles,
  resolveFillIdeasDayBase,
  resolveFillSlotTitle,
} from './fill-ideas.gate'

/**
 * Fill-in ideas: the prompt behind "Ideas for Day N".
 *
 * One day per call
 * ----------------
 * This used to ask for the whole trip at once. That is fine for two days and
 * stops being fine well before seven: the model has a fixed amount of care to
 * spend, and spreading it over forty slots buys forty shallow answers. So each
 * day is its own call, and the days run in order.
 *
 * Running in order is not a UI nicety, it is what makes the split work. A day
 * asked on its own would happily recommend the restaurant the day before
 * already used. Each call is therefore told two things it must not re-use:
 * every place already committed to a slot anywhere in the trip, and everything
 * the earlier days' calls suggested. The second is why Day 3 cannot be asked
 * before Day 2 — there would be nothing to hand it.
 *
 * Nothing here is applied to the draft. The operator reads it, keeps what they
 * like, and fills the slots by hand — which is also why the prompt does not
 * carry the pickable Payload pool. "What could go here" and "which of our
 * records fits here" are different questions, and this asks the first.
 *
 * Where the day starts
 * --------------------
 * The day's lodging is stated as the base to route from. Day 1 must have one
 * (`fill-ideas.gate.ts` refuses otherwise) because every distance the model
 * reasons about is measured from it. A later day inherits the last lodging set
 * before it, so a day that introduces its own is a move to a new base and the
 * prompt says so in as many words.
 *
 * Why the distances are numbers
 * -----------------------------
 * This asked for "how far apart they are" and got a breakfast 25 minutes' walk
 * from the hotel, presented without comment as the lead option. The model was
 * not wrong about the restaurant; it was never told what counts as close. So
 * the walking limits are stated as figures and as rules, the first stop of the
 * day is pinned hardest because nobody takes a taxi before breakfast, and every
 * suggestion has to print its own walking time — a constraint you cannot check
 * from the answer is a constraint the answer will drift past.
 *
 * The alternates are held to the same neighbourhood as the lead pick for the
 * same reason. Three options scattered across a city are not three options for
 * one slot; they are three different days, and picking between them silently
 * rewrites everything after them.
 */

const BLOCK_TYPE_KIND: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'somewhere to eat or drink',
  'itinerary-accommodations': 'somewhere to stay',
  'itinerary-where-staying': 'somewhere to stay',
  'itinerary-attractions': 'something to see or do',
  'itinerary-nightlife': 'somewhere to go at night',
  'itinerary-key-location': 'a place',
  'itinerary-tour-agency': 'a tour',
}

const DAYPART_LABEL: Record<string, string> = {
  morning: 'morning',
  late_morning: 'late morning',
  lunch: 'lunchtime',
  afternoon: 'afternoon',
  dinner: 'dinnertime',
  evening: 'evening',
  nightlife: 'late night',
}

export type PriorDaySuggestions = {
  dayIndex: number
  /** The earlier day's document as plain text; '' when it could not be loaded. */
  text: string
}

function describeSlot(item: ItineraryItemBlock, filledTitle: string): string {
  const label =
    item.shellSlotLabel?.trim() || item.momentLabel?.trim() || item.moment || 'Stop'
  const daypart = item.shellSlotDaypart ? DAYPART_LABEL[item.shellSlotDaypart] : ''
  const kind = BLOCK_TYPE_KIND[item.blockType] ?? 'a place'
  const when = daypart ? `, ${daypart}` : ''
  return filledTitle
    ? `- ${label}${when} — already chosen: ${filledTitle}`
    : `- ${label}${when} — EMPTY, needs ${kind}`
}

function travelerLines(draft: ListicleItineraryDraft): string[] {
  const profile = draft.travelerProfile
  if (!profile) return []
  const lines: string[] = []
  const add = (label: string, values: string[]) => {
    const kept = values.map((value) => value.trim()).filter(Boolean)
    if (kept.length) lines.push(`${label}: ${kept.join(', ')}`)
  }
  add('Traveler', profile.travelerTypes)
  add('Here for', profile.motivations)
  add('Into', profile.interests)
  if (profile.budget) lines.push(`Budget: ${profile.budget}`)
  add('Stays in', profile.accommodations)
  add('Needs', profile.practicalNeeds)
  if (profile.notes.trim()) lines.push(`Notes: ${profile.notes.trim()}`)
  return lines
}

/** How many slots this one day still needs a place for. */
export function countEmptyFillSlotsForDay(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): number {
  const day = draft.days[dayIndex]
  if (!day) return 0
  return [...day.whereStaying, ...day.items].filter(
    (item) => !resolveFillSlotTitle(item, relatedByBlockType),
  ).length
}

export function buildItineraryFillIdeasPrompt(
  draft: ListicleItineraryDraft,
  dayIndex: number,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
  locations: LocationOption[],
  priorDays: PriorDaySuggestions[] = [],
): string {
  const day = draft.days[dayIndex]
  const sections: string[] = []

  // The readable label, never `draft.location`, which is the scope key
  // (`peru|lima|miraflores`). A model handed the key spends its first search
  // working out what city it is looking at.
  const place = buildArticleLocationLabel(draft, locations).trim()

  sections.push(
    [
      `This is an itinerary I am building. ${draft.title.trim() || 'Untitled'}.`,
      `Place: ${place || 'unspecified'}.`,
      `The whole trip is ${draft.dayCount} day${draft.dayCount === 1 ? '' : 's'}.`,
      `I am working on Day ${dayIndex + 1} only.`,
    ].join('\n'),
  )

  const traveler = travelerLines(draft)
  if (traveler.length) sections.push(`Who it is for:\n${traveler.join('\n')}`)

  const brief = draft.generationBrief?.trim()
  if (brief) sections.push(`What I am going for:\n${brief}`)

  const base = resolveFillIdeasDayBase(draft, dayIndex, relatedByBlockType)
  if (base) {
    sections.push(
      base.fromDayIndex === dayIndex && dayIndex > 0
        ? `They move today. From tonight they are staying at ${base.title}. Route this day so it ends there.`
        : `They are staying at ${base.title}. Route this day from there and back to it.`,
    )
  }

  const committed = collectCommittedPlaceTitles(draft, relatedByBlockType)
  if (committed.length) {
    sections.push(
      `Already in the itinerary somewhere — do not suggest these again:\n${committed
        .map((title) => `- ${title}`)
        .join('\n')}`,
    )
  }

  priorDays
    .filter((prior) => prior.text.trim())
    .forEach((prior) => {
      sections.push(
        `What you suggested for Day ${prior.dayIndex + 1}. Do not repeat any of it — this day has to be somewhere new:\n${prior.text.trim()}`,
      )
    })

  const rows = day
    ? [...day.whereStaying, ...day.items].map((item) =>
        describeSlot(item, resolveFillSlotTitle(item, relatedByBlockType)),
      )
    : []
  sections.push(
    `Day ${dayIndex + 1}:\n${rows.length ? rows.join('\n') : '- EMPTY, no stops yet'}`,
  )

  sections.push(
    [
      `Fill in every slot marked EMPTY for Day ${dayIndex + 1}. Only this day.`,
      '',
      'For each slot give me a lead pick first, then one or two alternates. The',
      'lead pick is the one you would actually choose standing there, not the',
      'most famous name.',
      '',
      'Distance is the part that goes wrong, so treat these as rules, not',
      'preferences:',
      '',
      '- The first stop of the day must be within a 10 minute walk of the hotel.',
      '  Nobody wants a taxi before breakfast. If nothing good is that close, say',
      '  so plainly instead of reaching further out.',
      '- Every other stop should be within about a 15 minute walk of the stop',
      '  before it.',
      '- Anything longer needs a reason, a named way of getting there and how',
      '  long it takes. A taxi is fine later in the day. It is not fine first',
      '  thing in the morning.',
      '- The alternates for a slot have to sit in the same part of town as the',
      '  lead pick. Three options scattered across the city are not three options',
      '  for one slot, they are three different days.',
      '',
      'Under every place, give its walking time from the stop before it — from',
      'the hotel for the first stop of the day — and say where that stops being a',
      'walk and becomes a taxi. Also say roughly how long someone would spend',
      'there, and whether it is open at that time of day.',
      '',
      'Never offer the same place twice, and never offer two places at the same',
      'address or in the same building as if they were separate options.',
      '',
      'If the day cannot be made to work inside those limits, say which slot you',
      'would move, merge or drop. Do not stretch the walk to make it fit. Keep',
      'the places you see already chosen; build around them.',
      '',
      'Return the whole answer as one HTML document. No Markdown, no code',
      'fence, nothing before or after the HTML. Style it so it is easy to read:',
      'the slot name as a heading, the lead pick first, the alternates under it,',
      'and each walking time easy to spot.',
    ].join('\n'),
  )

  return sections.join('\n\n')
}
