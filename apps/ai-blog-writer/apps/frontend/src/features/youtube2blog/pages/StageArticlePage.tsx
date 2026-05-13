import { StandardArticleStageBuilder } from '../../staging/components/StandardArticleStageBuilder'
import { getArticleById, updateArticle } from '../../staging/api'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  fetchExternalImageSource,
  fetchResult,
  getArticleSyncStatus,
  importExternalImage,
  markArticleSynced,
  searchPexelsImages,
  searchUnsplashImages,
  rewriteBlockWithAi,
} from '../api'

export type {
  ContentBlock,
  EditorialBlock,
  StagedArticle,
} from '../../staging/types'

export default function StageArticlePage() {
  return (
    <StandardArticleStageBuilder
      storageKey="youtube2blog_staged_articles_v2"
      routes={{
        stagePath: '/youtube2blog/articles',
        stageArticlePath: '/youtube2blog/stage-article',
        articlesPath: '/youtube2blog/articles',
      }}
      api={{
        fetchLocations,
        fetchMediaAssets,
        createArticle,
        updateArticle,
        getArticleById,
        convertMarkdownToLexical,
        fetchExternalImageSource,
        fetchResult,
        getArticleSyncStatus,
        importExternalImage,
        markArticleSynced,
        searchPexelsImages,
        searchUnsplashImages,
        rewriteBlockWithAi,
      }}
      featureLabel="YouTube2Blog"
      heroDescription="Step through setup, featured image selection, article content blocks, and SEO before saving drafts or publishing to Payload."
      syncBehavior="draft-sync"
      backToStageLabel="Back to Articles"
    />
  )
}
