export type RevalidationTarget = {
  tags?: string[]
  paths?: string[]
}

export type ArticleScope =
  | { kind: 'global' }
  | { kind: 'country'; country: string }
  | { kind: 'city'; country: string; city: string }

export type ArticleTypeKey = 'articles' | 'maps' | 'itineraries'

export type AnyDoc = Record<string, unknown>
