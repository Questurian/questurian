// Shared type definitions
export type CommonResponse<T = any> = {
  success: boolean
  message?: string
  data?: T
}

export type PaginationParams = {
  page?: number
  limit?: number
}

export type SortParams = {
  sort?: string
  order?: 'asc' | 'desc'
}