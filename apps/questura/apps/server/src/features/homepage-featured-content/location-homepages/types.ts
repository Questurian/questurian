import type { formatHomepageDoc } from '../resolve-page-blocks/service'

export type FormattedLocationHomepage = ReturnType<typeof formatHomepageDoc>

export type LocationHomepageOperationResult<TBody = unknown> = {
  status: number
  body: TBody
}

export type ErrorBody = { message: string }
