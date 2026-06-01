export interface Prompt2BlogCleanupRemovedBlock {
  label: string
  reason: string
  excerpt: string
}

export interface Prompt2BlogCleanupSource {
  sourceIndex: number
  inputChars: number
  precleanChars: number
  cleanedChars: number
  fallbackUsed: boolean
  title: string
  publishedAt: string
  cleanedText: string
  removedBlocks: Prompt2BlogCleanupRemovedBlock[]
}

export interface Prompt2BlogCleanupStageData {
  cleanupMode: string
  modelName: string
  sourceMaterialCount: number
  cleanedSourcesCount: number
  sources: Prompt2BlogCleanupSource[]
}
