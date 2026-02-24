import {
  getArticleSyncStatus as getArticleSyncStatusForFeature,
  markArticleSynced as markArticleSyncedForFeature,
} from '../../staging/api'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type { Prompt2BlogSyncStatusResponse } from '../types/articles.types'

export async function markArticleSynced(
  runId: string,
  payloadArticleId: number,
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  return markArticleSyncedForFeature(FEATURE_PREFIX, runId, payloadArticleId)
}

export async function getArticleSyncStatus(runId: string): Promise<Prompt2BlogSyncStatusResponse> {
  return getArticleSyncStatusForFeature(FEATURE_PREFIX, runId)
}
