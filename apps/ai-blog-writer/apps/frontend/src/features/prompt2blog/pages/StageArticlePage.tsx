import { StandardArticleStageBuilder } from '../../staging/components/StandardArticleStageBuilder'
import { getArticleById } from '../../staging/api'
import {
  convertMarkdownToLexical,
  createArticle,
  fetchExternalImageSource,
  fetchLocations,
  fetchMediaAssets,
  fetchResult,
  generateSeoMetadataWithAi,
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
      storageKey="prompt2blog_staged_articles_v2"
      routes={{
        stagePath: '/prompt2blog/articles',
        stageArticlePath: '/prompt2blog/stage-article',
        articlesPath: '/prompt2blog/articles',
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
        generateSeoMetadataWithAi,
      }}
      featureLabel="Prompt2Blog"
      heroDescription="Step through setup, featured image selection, article content blocks, and SEO before saving drafts or publishing to Payload."
      syncBehavior="draft-sync"
      backToStageLabel="Back to Articles"
    />
  )
}
