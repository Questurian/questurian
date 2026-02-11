import StageListPage from '../../staging/components/StageListPage'

export default function StagePage() {
  return (
    <StageListPage
      storageKey="url2blog_staged_articles"
      articlesPath="/url2blog/articles"
      stageArticlePath="/url2blog/stage-article"
      showEditorialBlocking
    />
  )
}
