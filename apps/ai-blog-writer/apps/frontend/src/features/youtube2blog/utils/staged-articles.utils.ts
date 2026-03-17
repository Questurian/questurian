const STAGED_ARTICLES_KEY = 'youtube2blog_staged_articles_v2'

export function getStagedArticlesCount(): number {
  try {
    const stored = localStorage.getItem(STAGED_ARTICLES_KEY)
    if (!stored) {
      return 0
    }
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}
