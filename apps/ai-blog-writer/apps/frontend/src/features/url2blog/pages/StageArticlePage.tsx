import EditorialStageArticlePage from '../../staging/components/EditorialStageArticlePage'
import {
  fetchLocations,
  fetchMediaAssets,
  createArticle,
  convertMarkdownToLexical,
  fetchExternalImageSource,
  fetchResult,
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
        convertMarkdownToLexical,
        fetchExternalImageSource,
        fetchResult,
        importExternalImage,
        markArticleSynced,
        searchPexelsImages,
        searchUnsplashImages,
        rewriteBlockWithAi,
      }}
    />
  )
}
