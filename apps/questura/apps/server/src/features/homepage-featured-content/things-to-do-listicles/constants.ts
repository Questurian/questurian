import type { SingleTypeListicleGridConfig } from '../reference-grid/listicle-grid'

export { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../types'
export {
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
} from '../types'

export const THINGS_TO_DO_LISTICLES_LISTICLE_TYPE = 'attractions'
export const THINGS_TO_DO_LISTICLES_COLLECTION = 'single-type-listicles'

export const THINGS_TO_DO_LISTICLES_GRID_CONFIG = {
  collection: THINGS_TO_DO_LISTICLES_COLLECTION,
  listicleType: THINGS_TO_DO_LISTICLES_LISTICLE_TYPE,
  invalidCollectionMessage:
    'Things to Do (listicles) blocks only support single-type-listicles items.',
  invalidTypeMessage(doc, ref) {
    const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title : `#${ref.id}`
    return `"${title}" is not an attractions listicle and cannot be used in this block.`
  },
} satisfies SingleTypeListicleGridConfig
