import type { formatHomepageDoc } from '../resolve-page-blocks/service'

export type FormattedLocationHomepage = ReturnType<typeof formatHomepageDoc>

export type LocationHomepageBlocksOperationResult<TBody = unknown> = {
  status: number
  body: TBody
}
