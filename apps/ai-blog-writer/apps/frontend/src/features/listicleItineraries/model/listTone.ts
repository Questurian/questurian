export type ListTone =
  | 'elevated'
  | 'casual'
  | 'hidden-gem'
  | 'family-friendly'
  | 'date-night'
  | 'budget'

export const LIST_TONE_OPTIONS: ReadonlyArray<{
  value: ListTone
  label: string
  description: string
}> = [
  {
    value: 'elevated',
    label: 'Elevated',
    description: 'Polished, refined, slightly formal'
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Friendly, conversational, easygoing'
  },
  {
    value: 'hidden-gem',
    label: 'Hidden Gem',
    description: 'Off-the-radar, insider, discovery-led'
  },
  {
    value: 'family-friendly',
    label: 'Family-Friendly',
    description: 'Warm, practical, kid-aware'
  },
  {
    value: 'date-night',
    label: 'Date Night',
    description: 'Intimate, atmospheric, romantic'
  },
  {
    value: 'budget',
    label: 'Budget',
    description: 'Value-focused, practical, accessible'
  }
]

export const DEFAULT_LIST_TONE: ListTone = 'elevated'

export function resolveListTone(value: unknown): ListTone {
  if (typeof value !== 'string') return DEFAULT_LIST_TONE
  if (LIST_TONE_OPTIONS.some((opt) => opt.value === value)) {
    return value as ListTone
  }
  return DEFAULT_LIST_TONE
}
