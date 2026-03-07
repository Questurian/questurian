import { StandardArticleStageBuilder } from '../../staging/components/StandardArticleStageBuilder'
import { getArticleById } from '../../staging/api'
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
      storageKey="url2blog_staged_articles"
      routes={{
        stagePath: '/url2blog/stage',
        stageArticlePath: '/url2blog/stage-article',
        articlesPath: '/url2blog/articles',
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
        importExternalImage,
        markArticleSynced,
        getArticleSyncStatus,
        searchPexelsImages,
        searchUnsplashImages,
        rewriteBlockWithAi,
      }}
      featureLabel="URL2Blog"
      heroDescription="Step through setup, featured image selection, article content blocks, and SEO before saving drafts or publishing to Payload."
      syncBehavior="draft-sync"
    />
  )
}
