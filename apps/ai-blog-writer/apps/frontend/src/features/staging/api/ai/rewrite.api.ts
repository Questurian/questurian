import { requestEditorAssist } from './editor-assist.request'
import type {
  RewriteBlockWithAiRequest,
  RewriteBlockWithAiResponse
} from './rewrite.types'

export function rewriteBlockWithAi(
  input: RewriteBlockWithAiRequest
): Promise<RewriteBlockWithAiResponse> {
  return requestEditorAssist('rewrite-block', {
    body: {
      prompt: input.prompt,
      block_content: input.blockContent,
      model_name: input.modelName,
      article_title: input.articleTitle,
      article_context: input.articleContext
    },
    errorMessage: 'AI rewrite failed'
  })
}
