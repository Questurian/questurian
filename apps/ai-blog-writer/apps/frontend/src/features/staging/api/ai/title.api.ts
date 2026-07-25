import { requestEditorAssist } from './editor-assist.request'
import type {
  GenerateTitleWithAiRequest,
  GenerateTitleWithAiResponse
} from './rewrite.types'

export function generateTitleWithAi(
  input: GenerateTitleWithAiRequest
): Promise<GenerateTitleWithAiResponse> {
  return requestEditorAssist('generate-title', {
    body: {
      current_title: input.currentTitle,
      prompt: input.prompt,
      model_name: input.modelName
    },
    errorMessage: 'AI title generation failed'
  })
}
