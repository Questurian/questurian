'use client'

import React from 'react'
import { TextBlock, ImageBlock } from './blocks'

interface Block {
  id?: string | number
  blockType?: string
  slug?: string
  content?: unknown
  text?: string
  textContent?: string
  image?: unknown
  imageFile?: unknown
  alt?: string
  altText?: string
  [key: string]: unknown
}

interface Article {
  id: string
  title: string
  description: string
  featuredImage?: unknown
  contentBlocks?: Block[]
  author?: unknown
  status: string
  publishedAt?: string
  createdAt?: string
  updatedAt?: string
}

interface ArticleRendererProps {
  article: Article
}

/**
 * Renders an article with its content blocks
 * Supports text and image blocks
 */
export const ArticleRenderer: React.FC<ArticleRendererProps> = ({ article }) => {
  if (!article.contentBlocks || article.contentBlocks.length === 0) {
    return (
      <article className="article-content">
        <p className="text-gray-500">No content blocks</p>
      </article>
    )
  }

  return (
    <article className="article-content max-w-3xl mx-auto">
      {article.contentBlocks.map((block, index) => (
        <RenderBlock key={block.id || index} block={block} />
      ))}
    </article>
  )
}

/**
 * Dispatcher that renders appropriate block component based on type
 */
interface RenderBlockProps {
  block: Block
}

const RenderBlock: React.FC<RenderBlockProps> = ({ block }) => {
  // Support both 'blockType' and 'slug' field names (slug is used in Payload blocks)
  const blockType = block.blockType || block.slug

  switch (blockType) {
    case 'text':
      return (
        <TextBlock
          content={block.content}
          text={block.text || block.textContent}
        />
      )

    case 'image':
      if (typeof block.image !== 'string' && typeof block.imageFile !== 'string' && typeof block.image !== 'object' && typeof block.imageFile !== 'object') {
        return null
      }

      return (
        <ImageBlock
          image={(block.image || block.imageFile) as string | { id: string; filename?: string }}
          alt={block.alt || block.altText || 'Article image'}
        />
      )

    default:
      console.warn(`Unknown block type: ${blockType}`)
      return null
  }
}
