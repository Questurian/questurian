import type { StagedArticle } from '../../../types'

export function getAllStagedArticles(storageKey: string): StagedArticle[] {
  const stored = localStorage.getItem(storageKey)
  return stored ? (JSON.parse(stored) as StagedArticle[]) : []
}

export function saveAllStagedArticles(
  storageKey: string,
  stagedArticles: StagedArticle[]
): void {
  localStorage.setItem(storageKey, JSON.stringify(stagedArticles))
}

export function upsertStagedArticle(
  storageKey: string,
  stagedArticle: StagedArticle
): void {
  const allStaged = getAllStagedArticles(storageKey)
  const index = allStaged.findIndex((candidate) => candidate.id === stagedArticle.id)
  if (index >= 0) {
    allStaged[index] = stagedArticle
  } else {
    allStaged.push(stagedArticle)
  }
  saveAllStagedArticles(storageKey, allStaged)
}

export function removeStagedArticle(
  storageKey: string,
  stagedArticleId: string
): void {
  const allStaged = getAllStagedArticles(storageKey)
  saveAllStagedArticles(
    storageKey,
    allStaged.filter((article) => article.id !== stagedArticleId)
  )
}
