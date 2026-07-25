import type {
  DayShellTemplate,
  ListicleItineraryDraft,
  LocationOption,
  TravelerProfile,
} from '../../types'

export type BuilderSetupPanelProps = {
  draft: ListicleItineraryDraft
  locations: LocationOption[]
  isSynced?: boolean
  onContinue: () => void
  onUpdateSetup: () => void
  onSaveSetup: () => void
  onCancelUpdateSetup: () => void
  updateDraft: (next: Partial<ListicleItineraryDraft>) => void
  onSlugChange?: (slug: string) => void
  onGenerateSlugWithAi?: () => Promise<void>
  isGeneratingSlug?: boolean
  onGenerateItinerary?: () => void
  isGeneratingItinerary?: boolean
  onComposeTravelerBrief?: (profile: TravelerProfile) => Promise<string>
  onViewAutobuildReport?: () => void
  hasAutobuildReport?: boolean
  libraryShells?: DayShellTemplate[]
  onOpenLayoutManager?: () => void
}
