import type { Block } from 'payload'

/**
 * Payload CMS block schema for the img-pair content block.
 * This matches what staging now sends in createArticle payloads.
 */
export const ImgPairBlock: Block = {
  slug: 'img-pair',
  interfaceName: 'ImgPairBlock',
  labels: {
    singular: 'Img Pair',
    plural: 'Img Pairs',
  },
  fields: [
    {
      name: 'imageOne',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      filterOptions: {
        width: {
          equals: 1200,
        },
        height: {
          equals: 1500,
        },
      },
    },
    {
      name: 'imageTwo',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      filterOptions: {
        width: {
          equals: 1200,
        },
        height: {
          equals: 1500,
        },
      },
    },
    {
      name: 'caption',
      type: 'text',
      required: false,
    },
  ],
}

export type ImgPairPayloadBlock = {
  blockType: 'img-pair'
  imageOne: number
  imageTwo: number
  caption?: string
}

/**
 * Payload CMS block schema for the img-trio content block.
 * Format selects allowed image dimensions:
 * - square => 1080x1080
 * - landscape => 1920x1080
 */
export const ImgTrioBlock: Block = {
  slug: 'img-trio',
  interfaceName: 'ImgTrioBlock',
  labels: {
    singular: 'Img Trio',
    plural: 'Img Trios',
  },
  fields: [
    {
      name: 'format',
      type: 'select',
      required: true,
      defaultValue: 'square',
      options: [
        { label: 'Square (1080x1080)', value: 'square' },
        { label: 'Landscape (1920x1080)', value: 'landscape' },
      ],
    },
    {
      name: 'imageOne',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
    },
    {
      name: 'imageTwo',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
    },
    {
      name: 'imageThree',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      required: false,
    },
  ],
}

export type ImgTrioPayloadBlock = {
  blockType: 'img-trio'
  format: 'square' | 'landscape'
  imageOne: number
  imageTwo: number
  imageThree: number
  caption?: string
}
