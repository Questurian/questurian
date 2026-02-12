import EditorialStageArticlePage from '../../staging/components/EditorialStageArticlePage'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  fetchResult,
  markArticleSynced,
  searchPexelsImages,
  rewriteBlockWithAi,
} from '../api'

export type {
  ContentBlock,
  EditorialBlock,
  StagedArticle,
} from '../../staging/types'

export default function StageArticlePage() {
  return (
    <EditorialStageArticlePage
      storageKey="prompt2blog_staged_articles"
      routes={{
        stagePath: '/prompt2blog/stage',
        stageArticlePath: '/prompt2blog/stage-article',
        articlesPath: '/prompt2blog/articles',
      }}
      api={{
        fetchLocations,
        fetchMediaAssets,
        createArticle,
        convertMarkdownToLexical,
        fetchResult,
        markArticleSynced,
        searchPexelsImages,
        rewriteBlockWithAi,
      }}
    />
  )
}
