export type MainHomepageDoc = {
  id?: number
  draftPageBlocks?: unknown
  publishedPageBlocks?: unknown
  lastPublishedAt?: string | null
  lastPublishedBy?: unknown
  publishedRevision?: number | null
}

export type MainHomepageOperationResult<TBody = unknown> = {
  status: number
  body: TBody
}

export type MainHomepageErrorBody = { message: string }
