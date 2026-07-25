import type { CollectionConfig } from 'payload'
import { revalidateArticleCollection } from '@/features/public-revalidation/revalidate-client'
import {
  syncSharedNeighborhoodsField,
} from '@/shared/location/server/articleLocationScope'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { clearStaleSocialImagesOnFeaturedImageChange } from './clearStaleSocialImages'
import {
  applySingleTypeListicleMetadata,
  preventSingleTypeListicleDelete,
  preventSingleTypeListicleUnpublish,
} from './lifecycle'
import { validateSingleTypeListicle } from './validateSingleTypeListicle'

const articleRevalidation = revalidateArticleCollection('single-type-listicles')

export const singleTypeListicleHooks: CollectionConfig['hooks'] = {
  beforeChange: [
    preventSingleTypeListicleUnpublish,
    clearStaleSocialImagesOnFeaturedImageChange,
    applySingleTypeListicleMetadata,
  ],
  beforeValidate: [
    syncLocationFields(),
    syncSharedNeighborhoodsField(),
    validateSingleTypeListicle,
  ],
  beforeDelete: [preventSingleTypeListicleDelete],
  afterChange: [articleRevalidation.afterChange],
  afterDelete: [articleRevalidation.afterDelete],
}
