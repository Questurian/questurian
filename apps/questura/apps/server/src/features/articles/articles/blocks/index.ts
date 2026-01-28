/**
 * Article Content Blocks
 * Defines block types for article content composition
 */

import { Block } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

/**
 * Text Block - Rich text content using Lexical editor
 */
export const TextBlock: Block = {
  slug: 'text',
  labels: {
    singular: 'Text Block',
    plural: 'Text Blocks',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor(),
      required: true,
      admin: {
        description: 'Article text content with formatting',
      },
    },
  ],
}

/**
 * Image Block - Images with alt text and optional caption
 */
export const ImageBlock: Block = {
  slug: 'image',
  labels: {
    singular: 'Image Block',
    plural: 'Image Blocks',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media-assets',
      required: true,
      admin: {
        description: 'Upload or select image from media library',
      },
    },
    {
      name: 'altText',
      type: 'text',
      required: true,
      admin: {
        description: 'Alt text for accessibility',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description: 'Optional caption displayed below image',
      },
    },
  ],
}

/**
 * All available article blocks
 */
export const articleBlocks = [TextBlock, ImageBlock]
