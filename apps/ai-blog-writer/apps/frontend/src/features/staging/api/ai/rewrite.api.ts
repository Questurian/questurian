import { API_BASE_URL } from '../client/config'
import { parseErrorResponse } from '../client/error-parser'
import type { RewriteBlockWithAiRequest, RewriteBlockWithAiResponse } from './rewrite.types'

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
