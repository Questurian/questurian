import type { CollectionConfig } from 'payload'
import { languageField } from '@/shared/i18n/languageField'
import { accessTierField } from '@/shared/content/accessTier'
import { singleTypeListicleAccess } from './access'
import {
  articleType,
  author,
  headerSection,
  inUpdateMode,
  items,
  listicleType,
  listTone,
  location,
  locationRef,
  publishedAt,
  seo,
  sharedNeighborhoods,
  slug,
  status,
  step1Complete,
  step1UiWrapper,
  targetItemCount,
  title,
} from './fields'
import { singleTypeListicleHooks } from './hooks'

export const SingleTypeListicles: CollectionConfig = {
  slug: 'single-type-listicles',
  labels: {
    singular: 'Single Type Listicle',
    plural: 'Single Type Listicles',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'listicleType', 'targetItemCount', 'status'],
    group: 'Articles',
  },
  access: singleTypeListicleAccess,
  fields: [
    step1Complete,
    inUpdateMode,

    title,
    location,
    locationRef,
    slug,
    sharedNeighborhoods,
    listicleType,
    targetItemCount,
    listTone,
    step1UiWrapper,

    headerSection,
    items,
    seo,

    status,
    languageField,
    accessTierField,
    author,
    publishedAt,
    articleType,
  ],
  hooks: singleTypeListicleHooks,
}
