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
 * Key Takeaway Block - Highlight concise takeaways for readers
 */
export const KeyTakeawayBlock: Block = {
  slug: 'key-takeaway',
  labels: {
    singular: 'Key Takeaway',
    plural: 'Key Takeaways',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      defaultValue: 'Key Takeaways',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 5,
      required: true,
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}

export const PullQuoteBlock: Block = {
  slug: 'pull-quote',
  labels: {
    singular: 'Pull Quote',
    plural: 'Pull Quotes',
  },
  fields: [
    {
      name: 'quote',
      type: 'textarea',
      required: true,
    },
  ],
}

export const InTheKnowBlock: Block = {
  slug: 'in-the-know',
  labels: {
    singular: 'In The Know',
    plural: 'In The Know Boxes',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      defaultValue: 'In The Know',
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
  ],
}

export const HighlightCalloutBlock: Block = {
  slug: 'highlight-callout',
  labels: {
    singular: 'Highlight Callout',
    plural: 'Highlight Callouts',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      defaultValue: 'Highlight Callout',
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
  ],
}

export const FAQBlock: Block = {
  slug: 'faq',
  labels: {
    singular: 'FAQ',
    plural: 'FAQ Blocks',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      defaultValue: 'FAQ',
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 2,
      maxRows: 5,
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
        },
        {
          name: 'answer',
          type: 'textarea',
          required: true,
        },
      ],
    },
  ],
}

/**
 * All available article blocks
 */
export const articleBlocks = [
  TextBlock,
  ImageBlock,
  KeyTakeawayBlock,
  PullQuoteBlock,
  InTheKnowBlock,
  HighlightCalloutBlock,
  FAQBlock,
]
