export type { FormattedLocationHomepage } from '../location-homepages/types'

export type LocationHomepageBlocksOperationResult<TBody = unknown> = {
  status: number
  body: TBody
}
