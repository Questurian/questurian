'use client'

import { SerializeLexicalToReact } from '@payloadcms/richtext-lexical/react'
import { defaultHTMLConverters } from '@payloadcms/richtext-lexical/html'

interface TextBlockProps {
  content?: any
  text?: string
}

export const TextBlock: React.FC<TextBlockProps> = ({ content, text }) => {
  // Handle both Lexical content and plain text
  if (content && typeof content === 'object') {
    // Lexical editor JSON content
    return (
      <div className="prose prose-lg max-w-none my-6 text-gray-700">
        <SerializeLexicalToReact
          nodes={content}
          converters={defaultHTMLConverters}
        />
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
