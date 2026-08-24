import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../api'
import type { Prompt2BlogModelStackId } from '../constants/prompt2blog.constants'

export interface RawBlob {
  id: number
  content: string
}

export interface P2BFormState {
  easySetupLocation: string
  easySetupTitle: string
  articleTypeId: number | null
  articleGoal: string
  targetReader: string
  destinationContext: string
  angle: string
  callToAction: string
  modelStackId: Prompt2BlogModelStackId
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  auditModel: Prompt2BlogWriterModel
  toneId: string
  lengthId: string
  brandVoiceId: string
  primaryKeyword: string
  secondaryKeywords: string
  mustInclude: string
  creativityLevel: 'low' | 'medium' | 'high'
  negativeInstructions: string
  enableEditorialAugmentation: boolean
  blobs: RawBlob[]
}
