import EditorialStageArticlePage from '../../staging/components/EditorialStageArticlePage'
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
    <EditorialStageArticlePage
      storageKey="youtube2blog_staged_articles_v2"
      routes={{
        stagePath: '/youtube2blog/stage',
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
      syncBehavior="draft-sync"
    />
  )
}
