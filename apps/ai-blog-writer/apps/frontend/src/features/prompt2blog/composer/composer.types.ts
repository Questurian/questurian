import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../api'

export interface RawBlob {
  id: number
  content: string
}

export interface P2BFormState {
  articleTypeId: number | null
  articleGoal: string
  targetReader: string
  destinationContext: string
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  toneId: string
  lengthId: string
  brandVoiceId: string
  primaryKeyword: string
  secondaryKeywords: string
  mustInclude: string
  audienceProfile: string
  creativityLevel: 'low' | 'medium' | 'high'
  negativeInstructions: string
  promptEnhance: boolean
  enableEditorialAugmentation: boolean
  blobs: RawBlob[]
}
