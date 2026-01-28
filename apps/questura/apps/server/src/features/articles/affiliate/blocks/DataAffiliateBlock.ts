/**
 * Data Affiliate Block
 * Block type for selecting affiliate products from the data collection
 * References AffiliateProducts collection
 */

import { Block } from 'payload'

export const DataAffiliateBlock: Block = {
  slug: 'data-affiliate',
  labels: {
    singular: 'Affiliate Product',
    plural: 'Affiliate Products',
  },
  admin: {
    initCollapsed: false,
  },
  // Custom label that shows the item's title instead of "Untitled"
  label: ({ data }) => {
    if (data?.item && typeof data.item === 'object' && 'title' in data.item) {
      return (data.item as { title: string }).title || 'Affiliate Product'
    }
    return 'Affiliate Product'
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'affiliate-products',
      required: true,
      admin: {
        description: 'Select an affiliate product from the data collection',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial content or commentary about this product',
      },
    },
  ],
}

