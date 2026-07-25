import type { Field } from 'payload'
import { placeCategoryFields } from './categoryFields'
import { placeDetailsTab } from './detailsTab'
import { placeLocationTab } from './locationTab'
import { placeMetaFields } from './metaFields'

export const placeFields: Field[] = [
  ...placeCategoryFields,
  {
    type: 'tabs',
    tabs: [placeDetailsTab, placeLocationTab],
  },
  ...placeMetaFields,
]
