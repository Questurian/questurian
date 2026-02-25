import type { EditorAssistModelName } from './models'

export type RewriteBlockWithAiResponse = {
  rewritten_content: string
  model_used: string
}

export type RewriteBlockWithAiRequest = {
  prompt: string
  blockContent: string
  modelName?: EditorAssistModelName
  articleTitle?: string
  articleContext?: string
}

export type GenerateTitleWithAiRequest = {
  currentTitle: string
  prompt: string
  modelName?: EditorAssistModelName
}

export type GenerateTitleWithAiResponse = {
  title: string
}
