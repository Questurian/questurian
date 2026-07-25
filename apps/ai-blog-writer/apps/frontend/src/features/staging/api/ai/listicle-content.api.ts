import { requestEditorAssist } from './editor-assist.request'
import type {
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  ListicleGuidelinesResponse
} from './rewrite.types'

export function fetchListicleGuidelines(): Promise<ListicleGuidelinesResponse> {
  return requestEditorAssist('listicle-guidelines', {
    method: 'GET',
    errorMessage: 'Failed to load listicle guidelines'
  })
}

export function generateListicleContentWithAi(
  input: GenerateListicleContentRequest
): Promise<GenerateListicleContentResponse> {
  return requestEditorAssist('generate-listicle-content', {
    body: {
      article_title: input.articleTitle,
      article_type: input.articleType,
      location_label: input.locationLabel,
      article_context: input.articleContext,
      model_name: input.modelName,
      custom_instruction: input.customInstruction,
      skip_existing: input.skipExisting,
      list_tone: input.listTone,
      targets: input.targets.map((target) => ({
        target_id: target.targetId,
        field_type: target.fieldType,
        category: target.category,
        display_name: target.displayName,
        research_subject: target.researchSubject,
        location_label: target.locationLabel,
        current_content: target.currentContent,
        supporting_context: target.supportingContext,
        payload_doc_id: target.payloadDocId,
        payload_collection: target.payloadCollection,
        angle: target.angle
      }))
    },
    errorMessage: 'AI listicle generation failed'
  })
}
