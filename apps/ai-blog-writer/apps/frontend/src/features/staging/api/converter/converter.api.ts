import { CONVERTER_URL } from '../../../../shared/api/client/config'
import type { LexicalConvertResponse } from './converter.types'

export async function convertLexicalToMarkdown(lexical: object): Promise<{
  success: boolean
  markdown?: string
  error?: string
}> {
  const response = await fetch(`${CONVERTER_URL}/convert/lexical`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lexical }),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Conversion failed' }))

    return { success: false, error: errorData.error || 'Conversion failed' }
  }

  return response.json()
}

export async function convertMarkdownToLexical(markdown: string): Promise<LexicalConvertResponse> {
  const response = await fetch(`${CONVERTER_URL}/convert/markdown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ markdown }),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Conversion failed' }))

    return { success: false, error: errorData.error || 'Conversion failed' }
  }

  return response.json()
}
