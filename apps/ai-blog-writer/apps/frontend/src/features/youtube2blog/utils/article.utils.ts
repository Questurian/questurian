export function removeTitleFromArticle(articleContent: string): string {
  if (!articleContent) {
    return articleContent
  }

  return articleContent.replace(/^# .+\n+\n?/, '').trim()
}
