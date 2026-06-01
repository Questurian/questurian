import type { EditorialBlock } from '../../../types'
import { extractEditorialBlocks } from '../editorial-markdown.service'

export async function fetchEditorialBlocksFromRun(
  runId: string,
  fetchResultFn: (runId: string) => Promise<{ markdown: string }>
): Promise<EditorialBlock[]> {
  if (!runId) return []

  try {
    const result = await fetchResultFn(runId)
    const extracted = extractEditorialBlocks(result.markdown || '')
    return extracted.editorialBlocks
  } catch {
    return []
  }
}
