import type { RelatedItemCollection } from './blockTypes'

export type PayloadRichText = Record<string, unknown>

export type PolymorphicRelatedItemValue = {
  relationTo?: RelatedItemCollection | null
  value?: number | { id?: number } | null
}
