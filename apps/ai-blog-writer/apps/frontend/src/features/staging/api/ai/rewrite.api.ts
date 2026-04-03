import { API_BASE_URL } from '../client/config'
import { parseErrorResponse } from '../client/error-parser'
import type {
  GenerateTitleWithAiRequest,
  GenerateTitleWithAiResponse,
  GenerateListicleContentRequest,
  GenerateListicleContentResponse,
  RewriteBlockWithAiRequest,
  RewriteBlockWithAiResponse,
} from './rewrite.types'

export async function generateTitleWithAi(
  input: GenerateTitleWithAiRequest,
): Promise<GenerateTitleWithAiResponse> {
  const { currentTitle, prompt, modelName } = input

  const response = await fetch(`${API_BASE_URL}/editor-assist/generate-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      current_title: currentTitle,
      prompt,
      model_name: modelName,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI title generation failed', { detail: 'AI title generation failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function rewriteBlockWithAi(
  input: RewriteBlockWithAiRequest,
): Promise<RewriteBlockWithAiResponse> {
  const {
    prompt,
    blockContent,
    modelName,
    articleTitle,
    articleContext,
  } = input

  const response = await fetch(`${API_BASE_URL}/editor-assist/rewrite-block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      block_content: blockContent,
      model_name: modelName,
      article_title: articleTitle,
      article_context: articleContext,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI rewrite failed', { detail: 'AI rewrite failed' })
    throw new Error(message)
  }

  return response.json()
}

export async function generateListicleContentWithAi(
  input: GenerateListicleContentRequest,
): Promise<GenerateListicleContentResponse> {
  const response = await fetch(`${API_BASE_URL}/editor-assist/generate-listicle-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      article_title: input.articleTitle,
      article_type: input.articleType,
      location_label: input.locationLabel,
      article_context: input.articleContext,
      model_name: input.modelName,
      custom_instruction: input.customInstruction,
      skip_existing: input.skipExisting,
      targets: input.targets.map((target) => ({
        target_id: target.targetId,
        field_type: target.fieldType,
        category: target.category,
        display_name: target.displayName,
        research_subject: target.researchSubject,
        location_label: target.locationLabel,
        current_content: target.currentContent,
        supporting_context: target.supportingContext,
      })),
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'AI listicle generation failed', { detail: 'AI listicle generation failed' })
    throw new Error(message)
  }

  return response.json()
}
