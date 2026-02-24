import { useState } from 'react'

import { convertMarkdownToLexical } from '../api'
import type { LexicalCopyStatus } from '../types/youtube2blog.types'

export function useLexicalCopy() {
  const [status, setStatus] = useState<LexicalCopyStatus>('idle')

  const copy = async (markdown: string) => {
    setStatus('loading')
    try {
      const result = await convertMarkdownToLexical(markdown)
      if (result.success && result.data) {
        await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
        setStatus('success')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        console.error('Conversion failed:', result.error)
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Failed to convert/copy:', error)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return {
    status,
    copy,
  }
}
