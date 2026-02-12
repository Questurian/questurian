const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const CONVERTER_URL = import.meta.env.VITE_CONVERTER_URL || 'http://localhost:4004'
const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

export type LexicalConvertResponse = {
  success: boolean
  data?: object
  error?: string
  metadata?: {
    nodeCount: number
    hasContent: boolean
    timestamp: string
  }
}

export type RewriteBlockWithAiResponse = {
  rewritten_content: string
  model_used: string
}

export type RewriteBlockWithAiRequest = {
  prompt: string
  blockContent: string
  modelName?: string
  articleTitle?: string
  articleContext?: string
}

export type Location = {
  id: number
  level: 'country' | 'city' | 'neighborhood'
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey: string
  parentKey?: string | null
  updatedAt: string
  createdAt: string
}

export type ArticleCategory = {
  id: number
  name: string
  slug?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type ArticleTag = {
  id: number
  name: string
  slug?: string
  displayName?: string
  description?: string
  usageCount?: number
  status?: 'active' | 'archived'
  updatedAt: string
  createdAt: string
}

export type MediaAsset = {
  id: number
  filename: string
  alt?: string
  alt_text?: string
  altText?: string
  mediaSet?: number | string | { id?: number | string } | null
  variant?:
    | 'thumbnail'
    | 'square'
    | 'wide'
    | 'portrait'
    | 'hero'
    | 'open_graph'
    | 'editorial'
  url?: string
  mimeType?: string
  filesize?: number
  width?: number
  height?: number
}

export type CreateArticlePayload = {
  title: string
  location?: string
  locationRef?: number
  step1_complete: boolean
  status?: 'draft' | 'published'
  category?: number
  tags?: number[]
  headerSection?: {
    featuredImage?: number
    intro?: object
  }
  contentBlocks?: Array<
    | {
        blockType: 'text'
        content?: object
      }
    | {
        blockType: 'image'
        image?: number
        altText?: string
        caption?: string
      }
    | {
        blockType: 'img-pair'
        imageOne: number
        imageTwo: number
        caption?: string
      }
    | {
        blockType: 'img-trio'
        format: 'square' | 'landscape'
        imageOne: number
        imageTwo: number
        imageThree: number
        caption?: string
      }
    | {
        blockType: 'key-takeaway'
        label: string
        items: Array<{ text: string }>
      }
    | {
        blockType: 'pull-quote'
        quote: string
      }
    | {
        blockType: 'in-the-know'
        label: string
        text: string
      }
  >
  seoSection?: {
    seo?: number
  }
}

async function payloadRequest(endpoint: string, token?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
  }

  return response.json()
}

export async function convertMarkdownToLexical(markdown: string): Promise<LexicalConvertResponse> {
  const response = await fetch(`${CONVERTER_URL}/convert/markdown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ markdown }),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Conversion failed' }))

    return { success: false, error: errorData.error || 'Conversion failed' }
  }

  return response.json()
}

export async function rewriteBlockWithAi(
  input: RewriteBlockWithAiRequest
): Promise<RewriteBlockWithAiResponse> {
  const {
    prompt,
    blockContent,
    modelName,
    articleTitle,
    articleContext,
  } = input

  const response = await fetch(`${API_BASE_URL}/editor-assist/rewrite-block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      block_content: blockContent,
      model_name: modelName,
      article_title: articleTitle,
      article_context: articleContext,
    }),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ detail: 'AI rewrite failed' }))

    throw new Error(errorData.detail || 'AI rewrite failed')
  }

  return response.json()
}

export async function fetchLocations(
  token?: string,
  params?: {
    limit?: number
    page?: number
  }
): Promise<{ docs: Location[]; totalDocs: number; totalPages: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.page) queryParams.append('page', String(params.page))

  return payloadRequest(`/api/locations?${queryParams.toString()}`, token)
}

export async function fetchArticleCategories(
  token?: string,
  params?: {
    limit?: number
    status?: string
  }
): Promise<{ docs: ArticleCategory[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)

  return payloadRequest(`/api/article-categories?${queryParams.toString()}`, token)
}

export async function fetchArticleTags(
  token?: string,
  params?: {
    limit?: number
    status?: string
  }
): Promise<{ docs: ArticleTag[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 100))
  if (params?.status) queryParams.append('where[status][equals]', params.status)

  return payloadRequest(`/api/article-tags?${queryParams.toString()}`, token)
}

export async function fetchMediaAssets(
  token?: string,
  params?: {
    limit?: number
    mimeType?: string
    minWidth?: number
    minHeight?: number
    width?: number
    height?: number
  }
): Promise<{ docs: MediaAsset[]; totalDocs: number }> {
  const queryParams = new URLSearchParams()
  queryParams.append('limit', String(params?.limit || 50))
  if (params?.mimeType) queryParams.append('where[mimeType][like]', params.mimeType)
  if (params?.minWidth) {
    queryParams.append('where[width][greater_than_equal]', String(params.minWidth))
  }
  if (params?.minHeight) {
    queryParams.append('where[height][greater_than_equal]', String(params.minHeight))
  }
  if (params?.width) {
    queryParams.append('where[width][equals]', String(params.width))
  }
  if (params?.height) {
    queryParams.append('where[height][equals]', String(params.height))
  }

  return payloadRequest(`/api/media-assets?${queryParams.toString()}`, token)
}

export async function createArticle(
  article: CreateArticlePayload,
  token: string
): Promise<{ id: number; title: string; slug: string }> {
  const response = await fetch(`${PAYLOAD_API_URL}/api/articles`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(article),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: 'Unknown error' }))

    throw new Error(errorData.message || `Failed to create article: ${response.status}`)
  }

  const result = await response.json()
  return result.doc
}

export async function markArticleSynced(
  featurePrefix: string,
  runId: string,
  payloadArticleId: number
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  const response = await fetch(
    `${API_BASE_URL}${featurePrefix}/articles/${runId}/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload_article_id: payloadArticleId }),
    }
  )

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ detail: 'Unknown error' }))

    throw new Error(
      errorData.detail || `Failed to mark article synced: ${response.status}`
    )
  }

  return response.json()
}

export async function getArticleSyncStatus(
  featurePrefix: string,
  runId: string
): Promise<{
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}> {
  const response = await fetch(`${API_BASE_URL}${featurePrefix}/articles/${runId}/sync`)

  if (!response.ok) {
    throw new Error(`Failed to get sync status: ${response.status}`)
  }

  return response.json()
}
