import { StandardArticleStageBuilder } from '../../staging/components/StandardArticleStageBuilder'
import {
  convertMarkdownToLexical,
  createArticle,
  fetchExternalImageSource,
  fetchLocations,
  fetchMediaAssets,
  fetchResult,
  getArticleSyncStatus,
  importExternalImage,
  markArticleSynced,
  rewriteBlockWithAi,
  searchPexelsImages,
  searchUnsplashImages,
  updateArticle,
} from '../api'

export type {
  ContentBlock,
  EditorialBlock,
  StagedArticle,
} from '../../staging/types'

export default function StageArticlePage() {
  return (
    <StandardArticleStageBuilder
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
        updateArticle,
        convertMarkdownToLexical,
        fetchExternalImageSource,
        fetchResult,
        importExternalImage,
        markArticleSynced,
        getArticleSyncStatus,
        searchPexelsImages,
        searchUnsplashImages,
        rewriteBlockWithAi,
      }}
      featureLabel="Prompt2Blog"
      heroDescription="Step through setup, featured image selection, article content blocks, and SEO before syncing a draft article to Payload."
      syncBehavior="draft-sync"
    />
  )
}
