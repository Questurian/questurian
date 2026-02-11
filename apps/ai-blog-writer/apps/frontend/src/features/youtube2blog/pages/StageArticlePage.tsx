import EditorialStageArticlePage from '../../staging/components/EditorialStageArticlePage'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  fetchResult,
  markArticleSynced,
} from '../api'

export type {
  ContentBlock,
  EditorialBlock,
  StagedArticle,
} from '../../staging/types'

export default function StageArticlePage() {
  return (
    <EditorialStageArticlePage
      storageKey="youtube2blog_staged_articles"
      routes={{
        stagePath: '/youtube2blog/stage',
        stageArticlePath: '/youtube2blog/stage-article',
        articlesPath: '/youtube2blog/articles',
      }}
      api={{
        fetchLocations,
        fetchMediaAssets,
        createArticle,
        convertMarkdownToLexical,
        fetchResult,
        markArticleSynced,
      }}
    />
  )
}
