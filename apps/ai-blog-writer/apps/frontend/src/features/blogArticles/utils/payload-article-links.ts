export const PAYLOAD_ARTICLES_PATH = '/payload-articles'
export const PAYLOAD_ARTICLES_STAGE_PATH = '/payload-articles/stage-article'

export function buildPayloadArticleEditUrl(articleId: number): string {
  return `${PAYLOAD_ARTICLES_STAGE_PATH}?payloadId=${articleId}`
}

export function buildPayloadArticleDraftUrl(stagedId: string): string {
  return `${PAYLOAD_ARTICLES_STAGE_PATH}?stagedId=${encodeURIComponent(stagedId)}`
}
