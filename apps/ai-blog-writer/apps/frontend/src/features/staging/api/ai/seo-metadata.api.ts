import { requestEditorAssist } from './editor-assist.request'
import type {
  GenerateSeoMetadataWithAiRequest,
  GenerateSeoMetadataWithAiResponse
} from './rewrite.types'

export function generateSeoMetadataWithAi(
  input: GenerateSeoMetadataWithAiRequest
): Promise<GenerateSeoMetadataWithAiResponse> {
  return requestEditorAssist('generate-seo-metadata', {
    body: {
      prompt: input.prompt,
      seed: input.seed,
      model_name: input.modelName,
      article_title: input.articleTitle,
      article_context: input.articleContext
    },
    errorMessage: 'AI SEO generation failed'
  })
}
