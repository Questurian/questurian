/**
 * Markdown to Lexical JSON Converter Service
 *
 * Converts Markdown to Lexical JSON format compatible with Payload CMS.
 * Port: 4010
 */

import express from 'express'
import { createHeadlessEditor } from '@lexical/headless'
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { JSDOM } from 'jsdom'

// Import Lexical nodes
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table'
import {
  DecoratorNode,
  $getRoot,
  $insertNodes,
  type SerializedLexicalNode
} from 'lexical'

/**
 * Custom HorizontalRuleNode for headless usage
 */
class HorizontalRuleNode extends DecoratorNode<null> {
  static getType(): string {
    return 'horizontalrule'
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key)
  }

  static importJSON(): HorizontalRuleNode {
    return new HorizontalRuleNode()
  }

  exportJSON(): SerializedLexicalNode {
    return {
      type: 'horizontalrule',
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement('hr')
  }

  updateDOM(): false {
    return false
  }

  decorate(): null {
    return null
  }
}

const app = express()
const PORT = process.env.PORT || 4010

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`)
  next()
})

// CORS - handle preflight before anything else
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})

// Handle OPTIONS preflight immediately - don't parse body
app.options('*', (req, res) => {
  console.log(`OPTIONS preflight from: ${req.headers.origin || 'unknown'}`)
  res.sendStatus(200)
})

// Body parsers - only for non-OPTIONS requests
app.use(express.json({ limit: '10mb' }))
app.use(express.text({ type: 'text/plain', limit: '10mb' }))

/**
 * Create a headless Lexical editor with all standard nodes
 */
function createEditor() {
  return createHeadlessEditor({
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
      HorizontalRuleNode,
      TableNode,
      TableCellNode,
      TableRowNode,
    ],
    onError: (error) => {
      console.error('Lexical error:', error)
    },
  })
}

/**
 * Convert Markdown to Lexical JSON
 */
export async function markdownToLexical(markdown: string): Promise<object> {
  const editor = createEditor()

  await editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS)
  })

  return editor.getEditorState().toJSON()
}

/**
 * Convert HTML to Lexical JSON
 */
export async function htmlToLexical(html: string): Promise<object> {
  const editor = createEditor()
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`)

  await editor.update(() => {
    const nodes = $generateNodesFromDOM(editor, dom.window.document)
    const root = $getRoot()
    root.clear()
    $insertNodes(nodes)
  })

  return editor.getEditorState().toJSON()
}

/**
 * Convert Lexical JSON to HTML
 */
export async function lexicalToHtml(lexicalState: object): Promise<string> {
  const editor = createEditor()
  const state = editor.parseEditorState(JSON.stringify(lexicalState))
  editor.setEditorState(state)

  let html = ''
  state.read(() => {
    html = $generateHtmlFromNodes(editor, null)
  })

  return html
}

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'lexical-converter',
    timestamp: new Date().toISOString(),
  })
})

// POST /convert/markdown - Convert markdown to Lexical JSON
app.post('/convert/markdown', async (req, res) => {
  // Accept both text/plain and JSON with { markdown: "..." }
  let markdown: string

  if (typeof req.body === 'string') {
    markdown = req.body
  } else if (req.body?.markdown) {
    markdown = req.body.markdown
  } else {
    res.status(400).json({
      success: false,
      error: 'Request body must be markdown text or JSON with { markdown: "..." }',
    })
    return
  }

  if (markdown.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Markdown content cannot be empty',
    })
    return
  }

  try {
    const lexicalState = await markdownToLexical(markdown)

    res.json({
      success: true,
      data: lexicalState,
      metadata: {
        nodeCount: (lexicalState as any)?.root?.children?.length ?? 0,
        hasContent: ((lexicalState as any)?.root?.children?.length ?? 0) > 0,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Markdown conversion error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
    })
  }
})

// POST /convert/html - Convert HTML to Lexical JSON
app.post('/convert/html', async (req, res) => {
  let html: string

  if (typeof req.body === 'string') {
    html = req.body
  } else if (req.body?.html) {
    html = req.body.html
  } else {
    res.status(400).json({
      success: false,
      error: 'Request body must be HTML text or JSON with { html: "..." }',
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
      error: error instanceof Error ? error.message : 'Conversion failed',
    })
  }
})

// POST /convert/validate - Validate Lexical structure
app.post('/convert/validate', (req, res) => {
  const { lexical } = req.body
  const errors: string[] = []

  if (!lexical || typeof lexical !== 'object') {
    errors.push('Lexical state must be an object')
  } else {
    if (!lexical.root) {
      errors.push('Missing root node')
    } else {
      if (lexical.root.type !== 'root') {
        errors.push('Root node must have type "root"')
      }
      if (!Array.isArray(lexical.root.children)) {
        errors.push('Root must have children array')
      }
    }
  }

  res.json({
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  })
})

// API docs
app.get('/', (_req, res) => {
  res.json({
    name: 'Lexical Converter Service',
    version: '1.0.0',
    description: 'Converts Markdown/HTML to Lexical JSON for Payload CMS',
    endpoints: {
      'POST /convert/markdown': {
        description: 'Convert Markdown to Lexical JSON',
        contentType: 'text/plain or application/json',
        body: 'Raw markdown OR { markdown: "..." }',
      },
      'POST /convert/html': {
        description: 'Convert HTML to Lexical JSON',
        contentType: 'text/plain or application/json',
        body: 'Raw HTML OR { html: "..." }',
      },
      'POST /convert/validate': {
        description: 'Validate Lexical JSON structure',
        body: '{ lexical: LexicalState }',
      },
      'GET /health': 'Health check',
    },
  })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`Lexical Converter running at http://localhost:${PORT}`)
})
