export type DayShellId = string

export type ShellSlotDaypart =
  | 'morning'
  | 'late_morning'
  | 'lunch'
  | 'afternoon'
  | 'dinner'
  | 'evening'
  | 'nightlife'

export type ShellSlotCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'

export type DayShellSlot = {
  id: string
  label: string
  daypart: ShellSlotDaypart
  acceptableCollections: ShellSlotCollection[]
  preferredCollections: ShellSlotCollection[]
  intentTags: string[]
  avoidTags?: string[]
}

export type DayShellTemplate = {
  id: DayShellId
  name: string
  description: string
  slots: DayShellSlot[]
}

export type DayShellSelection = {
  dayId: string
  shellId: DayShellId
}
