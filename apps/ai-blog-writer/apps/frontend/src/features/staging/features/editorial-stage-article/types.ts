import type { UploadImageResponse } from '../../../../shared/images'
import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type {
  CreateArticlePayload,
  ExternalImageProvider,
  Location,
  MediaAsset,
  PexelsOrientation,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../api'

export type MediaVariant =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'portrait'
  | 'hero'
  | 'open_graph'
  | 'editorial'

export type BlockImageModalMode = 'default' | 'img' | 'img-trio'
export type ImgTrioFormat = 'square' | 'landscape'
export type PexelsOrientationOption = PexelsOrientation | ''
export type ImageSourceOption = 'payload' | 'upload' | 'unsplash' | 'pexels'
export type EditorModelName =
  | 'claude-opus-4-8'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'

export type EditorialStageArticleApi = {
  fetchLocations: (
    token?: string,
    params?: { limit?: number; page?: number }
  ) => Promise<{ docs: Location[]; totalDocs: number; totalPages: number }>
  fetchMediaAssets: (
    token?: string,
    params?: {
      limit?: number
      page?: number
      mimeType?: string
      minWidth?: number
      minHeight?: number
      width?: number
      height?: number
      id?: number
    }
  ) => Promise<{ docs: MediaAsset[]; totalDocs: number; totalPages: number }>
  createArticle: (
    payload: CreateArticlePayload,
    token: string
  ) => Promise<PayloadArticleDoc>
  convertMarkdownToLexical: (markdown: string) => Promise<{
    success: boolean
    data?: object
    error?: string
  }>
  fetchResult: (runId: string) => Promise<{ markdown: string }>
  markArticleSynced: (
    runId: string,
    payloadArticleId: number
  ) => Promise<{ message: string; run_id: string; payload_article_id: number }>
  updateArticle?: (
    id: number,
    payload: CreateArticlePayload,
    token: string
  ) => Promise<PayloadArticleDoc>
  getArticleById?: (
    id: number,
    token: string
  ) => Promise<PayloadArticleDoc>
  getArticleSyncStatus?: (runId: string) => Promise<{
    synced_to_payload: boolean
    payload_article_id: number | null
    synced_at: string | null
  }>
  searchPexelsImages: (
    query: string,
    params?: {
      perPage?: number
      page?: number
      orientation?: PexelsOrientation
    }
  ) => Promise<{
    photos: PexelsPhoto[]
  }>
  searchUnsplashImages: (
    query: string,
    params?: {
      perPage?: number
      page?: number
      orientation?: PexelsOrientation
    }
  ) => Promise<{
    photos: UnsplashPhoto[]
  }>
  importExternalImage: (
    input: {
      sourceUrl: string
      provider: ExternalImageProvider
      externalRef: string
      altText: string
      photographerCredit: string
      locationRef: number
      photoId?: string | number
    },
    token: string
  ) => Promise<UploadImageResponse>
  fetchExternalImageSource: (
    input: {
      sourceUrl: string
      provider: ExternalImageProvider
      photoId?: string | number
    },
    token: string
  ) => Promise<{
    blob: Blob
    fileName: string
    contentType: string
  }>
  rewriteBlockWithAi: (
    input: {
      prompt: string
      blockContent: string
      modelName?: EditorModelName
      articleTitle?: string
      articleContext?: string
    }
  ) => Promise<{ rewritten_content: string }>
}

export type EditorialStageRoutes = {
  stagePath: string
  stageArticlePath: string
  articlesPath: string
}

export type EditorialStageArticlePageProps = {
  storageKey: string
  routes: EditorialStageRoutes
  api: EditorialStageArticleApi
  syncBehavior?: 'finalize' | 'draft-sync'
}

export type BlockImageModalState = {
  blockId: string
  show: boolean
  mode: BlockImageModalMode
  replaceExistingBlock?: boolean
}

export type OpenBlockImageModalOptions = {
  caption?: string
  trioFormat?: ImgTrioFormat
  selectedAssetIds?: number[]
  replaceExistingBlock?: boolean
}

export type ExternalImageCropContext = 'featured' | 'block'

export type ExternalImageCropDraft = {
  context: ExternalImageCropContext
  provider: ExternalImageProvider
  sourceUrl: string
  photoId?: string | number
  file: File
  externalRef: string
  fileNamePrefix: string
  altText: string
  photographerCredit: string
  blockId?: string
  replaceExistingBlock?: boolean
  blockMode?: BlockImageModalMode
  trioFormat?: ImgTrioFormat
}

export type SupportedEditorialComponent =
  | 'key_takeaways_box'
  | 'pull_quote'
  | 'in_the_know_box'
  | 'highlight_callout'
  | 'faq_block'
