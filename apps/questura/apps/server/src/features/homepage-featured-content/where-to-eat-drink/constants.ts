import type { SingleTypeListicleGridConfig } from '../reference-grid/listicle-grid'

export { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../types'
export {
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '../types'

export const WHERE_TO_EAT_DRINK_LISTICLE_TYPE = 'dining'
export const WHERE_TO_EAT_DRINK_COLLECTION = 'single-type-listicles'

export const WHERE_TO_EAT_DRINK_GRID_CONFIG = {
  collection: WHERE_TO_EAT_DRINK_COLLECTION,
  listicleType: WHERE_TO_EAT_DRINK_LISTICLE_TYPE,
  invalidCollectionMessage: 'Where to Eat & Drink blocks only support single-type-listicles items.',
  invalidTypeMessage(doc, ref) {
    const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title : `#${ref.id}`
    return `"${title}" is not a dining listicle and cannot be used in this block.`
  },
} satisfies SingleTypeListicleGridConfig
