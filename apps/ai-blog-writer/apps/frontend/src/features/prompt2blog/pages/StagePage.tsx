import StageListPage from '../../staging/components/StageListPage'

export default function StagePage() {
  return (
    <StageListPage
      storageKey="prompt2blog_staged_articles_v2"
      articlesPath="/prompt2blog/articles"
      stageArticlePath="/prompt2blog/stage-article"
      showEditorialBlocking
    />
  )
}
