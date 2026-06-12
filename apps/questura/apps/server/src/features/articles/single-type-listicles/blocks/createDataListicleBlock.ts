import { Block } from 'payload'
import type { ItemMediaSourceCollection } from '../../shared/types'
import { createLocationFilter } from '../../shared/utils/locationFilter'
import { createTourPicksField } from '../../shared/utils/tourPicks'
import { createItemMediaFields } from './utils/itemMedia'
import { angleField } from './utils/angleField'

type DataListicleBlockConfig = {
  /** Block slug, e.g. `data-dining`. */
  slug: string
  /** Source collection the ranked item is picked from. */
  relationTo: ItemMediaSourceCollection
  /** Singular label, e.g. `Dining Item`. */
  singular: string
  /** Plural label, e.g. `Dining Items`. */
  plural: string
  /** Admin description for the item relationship picker. */
  itemDescription: string
}

/**
 * Factory for the single-type listicle "data" blocks. Every block in this family
 * is a ranked item: a location-scoped relationship picker, the shared item-media
 * fields, an editorial angle, and a blurb. They differ only by collection, slug,
 * labels, and picker copy — so they are expressed as configuration here rather
 * than as four near-identical files.
 */
export const createDataListicleBlock = ({
  slug,
  relationTo,
  singular,
  plural,
  itemDescription,
}: DataListicleBlockConfig): Block => ({
  slug,
  labels: {
    singular,
    plural,
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo,
      required: true,
      filterOptions: createLocationFilter(relationTo),
      admin: {
        description: itemDescription,
      },
    },
    // Tour Picks exist only where the source records carry LM-linked tours.
    ...(relationTo === 'attractions' ? [createTourPicksField()] : []),
    ...createItemMediaFields(relationTo),
    angleField,
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial blurb for why this item is on the list',
      },
    },
  ],
})
