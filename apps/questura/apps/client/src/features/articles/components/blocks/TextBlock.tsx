'use client'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

interface TextBlockProps {
  content?: unknown
  text?: string
}

export const TextBlock: React.FC<TextBlockProps> = ({ content, text }) => {
  // Handle both Lexical content and plain text
  if (content && typeof content === 'object' && 'root' in content) {
    // Lexical editor JSON content
    return (
      <div className="prose prose-lg max-w-none my-6 text-gray-700">
        <RichText data={content as SerializedEditorState} />
      </div>
    )
  }

  // Fallback for plain text
  if (text) {
    return (
      <div className="prose prose-lg max-w-none my-6">
        <p className="text-gray-700 leading-relaxed">{text}</p>
      </div>
    )
  }

  return null
}
