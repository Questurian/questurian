import { Router } from 'express'

import {
  htmlToLexical,
  lexicalToMarkdown,
  markdownToLexical
} from '../conversion/converter.js'

type LexicalRoot = {
  children?: unknown
  type?: unknown
}

type LexicalState = {
  root?: LexicalRoot
}

type SerializedEditorState = {
  root?: {
    children?: unknown[]
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Conversion failed'
}

export function createConversionRouter(): Router {
  const router = Router()

  router.post('/markdown', async (req, res) => {
    let markdown: string

    if (typeof req.body === 'string') {
      markdown = req.body
    } else if (req.body?.markdown) {
      markdown = req.body.markdown
    } else {
      res.status(400).json({
        success: false,
        error:
          'Request body must be markdown text or JSON with { markdown: "..." }'
      })
      return
    }

    if (markdown.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Markdown content cannot be empty'
      })
      return
    }

    try {
      const lexicalState = await markdownToLexical(markdown)
      const serializedState = lexicalState as SerializedEditorState
      const nodeCount = serializedState.root?.children?.length ?? 0

      res.json({
        success: true,
        data: lexicalState,
        metadata: {
          nodeCount,
          hasContent: nodeCount > 0,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Markdown conversion error:', error)
      res.status(500).json({
        success: false,
        error: errorMessage(error)
      })
    }
  })

  router.post('/lexical', async (req, res) => {
    const lexicalState = req.body?.lexical

    if (!lexicalState || typeof lexicalState !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Request body must be JSON with { lexical: { root: ... } }'
      })
      return
    }

    try {
      const markdown = await lexicalToMarkdown(lexicalState)
      res.json({ success: true, markdown })
    } catch (error) {
      console.error('Lexical-to-markdown conversion error:', error)
      res.status(500).json({
        success: false,
        error: errorMessage(error)
      })
    }
  })

  router.post('/html', async (req, res) => {
    let html: string

    if (typeof req.body === 'string') {
      html = req.body
    } else if (req.body?.html) {
      html = req.body.html
    } else {
      res.status(400).json({
        success: false,
        error: 'Request body must be HTML text or JSON with { html: "..." }'
      })
      return
    }

    try {
      const lexicalState = await htmlToLexical(html)
      res.json({ success: true, data: lexicalState })
    } catch (error) {
      console.error('HTML conversion error:', error)
      res.status(500).json({
        success: false,
        error: errorMessage(error)
      })
    }
  })

  router.post('/validate', (req, res) => {
    const lexical = req.body.lexical as LexicalState | undefined
    const errors: string[] = []

    if (!lexical || typeof lexical !== 'object') {
      errors.push('Lexical state must be an object')
    } else if (!lexical.root) {
      errors.push('Missing root node')
    } else {
      if (lexical.root.type !== 'root') {
        errors.push('Root node must have type "root"')
      }
      if (!Array.isArray(lexical.root.children)) {
        errors.push('Root must have children array')
      }
    }

    res.json({
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    })
  })

  return router
}
