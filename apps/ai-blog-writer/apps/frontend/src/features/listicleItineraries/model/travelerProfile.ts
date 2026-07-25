export type TravelerProfileBudget = '' | '$' | '$$' | '$$$' | '$$$$'

/**
 * Traveler Profile: structured description of the intended traveler, used to
 * AI-compose the Generation Brief. ABW-only planning state; not synced to
 * Payload. The free-text Generation Brief stays the only Autobuild input.
 */
export type TravelerProfile = {
  travelerTypes: string[]
  motivations: string[]
  interests: string[]
  budget: TravelerProfileBudget
  accommodations: string[]
  practicalNeeds: string[]
  notes: string
  /** Last composed paragraph applied to the Generation Brief; a differing
   * non-empty brief means the operator hand-edited it since (confirm before
   * replacing). */
  composedBrief: string
}

export function createEmptyTravelerProfile(): TravelerProfile {
  return {
    travelerTypes: [],
    motivations: [],
    interests: [],
    budget: '',
    accommodations: [],
    practicalNeeds: [],
    notes: '',
    composedBrief: ''
  }
}

export function isTravelerProfileEmpty(profile: TravelerProfile): boolean {
  return (
    profile.travelerTypes.length === 0 &&
    profile.motivations.length === 0 &&
    profile.interests.length === 0 &&
    !profile.budget &&
    profile.accommodations.length === 0 &&
    profile.practicalNeeds.length === 0 &&
    !profile.notes.trim()
  )
}
