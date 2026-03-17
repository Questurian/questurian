import StageListPage from '../../staging/components/StageListPage'

export default function StagePage() {
  return (
    <StageListPage
      storageKey="youtube2blog_staged_articles_v2"
      articlesPath="/youtube2blog/articles"
      stageArticlePath="/youtube2blog/stage-article"
      showEditorialBlocking
    />
  )
}
