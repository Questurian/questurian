import StageListPage from '../../staging/components/StageListPage'

export default function StagePage() {
  return (
    <StageListPage
      storageKey="youtube2blog_staged_articles"
      articlesPath="/youtube2blog/articles"
      stageArticlePath="/youtube2blog/stage-article"
      showEditorialBlocking
    />
  )
}
