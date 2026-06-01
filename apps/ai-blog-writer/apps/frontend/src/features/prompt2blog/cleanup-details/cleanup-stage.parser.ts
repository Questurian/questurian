import type {
  Prompt2BlogCleanupRemovedBlock,
  Prompt2BlogCleanupStageData,
} from './cleanup-stage.types'

export const CLEANUP_STAGE_KEY = 'stage_input_cleanup'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function readCleanupRemovedBlocks(value: unknown): Prompt2BlogCleanupRemovedBlock[] {
  if (!Array.isArray(value)) return []
  return value.map(entry => {
    const record = asRecord(entry)
    return {
      label: readString(record?.label),
      reason: readString(record?.reason),
      excerpt: readString(record?.excerpt),
    }
  }).filter(entry => entry.label || entry.reason || entry.excerpt)
}

export function readCleanupStageData(
  stages: Record<string, unknown> | null | undefined,
): Prompt2BlogCleanupStageData | null {
  const data = asRecord(asRecord(stages?.[CLEANUP_STAGE_KEY])?.data)
  if (!data) return null
  const cleanupStats = Array.isArray(data.cleanup_stats)
    ? data.cleanup_stats.map(entry => {
        const record = asRecord(entry)
        return {
          inputChars: readNumber(record?.input_chars),
          outputChars: readNumber(record?.output_chars),
        }
      })
    : []
  const cleanedSources = readStringArray(data.cleaned_sources)
  const sources = Array.isArray(data.sources)
    ? data.sources.map((entry, index) => {
        const record = asRecord(entry)
        return {
          sourceIndex: readNumber(record?.source_index) || index + 1,
          inputChars: readNumber(record?.input_chars),
          precleanChars: readNumber(record?.preclean_chars),
          cleanedChars: readNumber(record?.cleaned_chars),
          fallbackUsed: readBoolean(record?.fallback_used),
          title: readString(record?.title),
          publishedAt: readString(record?.published_at),
          cleanedText: readString(record?.cleaned_text),
          removedBlocks: readCleanupRemovedBlocks(record?.removed_blocks),
        }
      }).filter(entry => entry.cleanedText || entry.inputChars > 0)
    : cleanupStats.map((stats, index) => ({
        sourceIndex: index + 1,
        inputChars: stats.inputChars,
        precleanChars: 0,
        cleanedChars: stats.outputChars,
        fallbackUsed: false,
        title: '',
        publishedAt: '',
        cleanedText: cleanedSources[index] || '',
        removedBlocks: [],
      }))
  return {
    cleanupMode: readString(data.cleanup_mode),
    modelName: readString(data.model_name),
    sourceMaterialCount: readNumber(data.source_material_count),
    cleanedSourcesCount: readNumber(data.cleaned_sources_count),
    sources,
  }
}
