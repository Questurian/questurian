import { Router } from 'express'

export function createServiceRouter(): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'lexical-converter',
      timestamp: new Date().toISOString()
    })
  })

  router.get('/', (_req, res) => {
    res.json({
      name: 'Lexical Converter Service',
      version: '1.0.0',
      description: 'Converts Markdown/HTML to Lexical JSON for Payload CMS',
      endpoints: {
        'POST /convert/markdown': {
          description: 'Convert Markdown to Lexical JSON',
          contentType: 'text/plain or application/json',
          body: 'Raw markdown OR { markdown: "..." }'
        },
        'POST /convert/html': {
          description: 'Convert HTML to Lexical JSON',
          contentType: 'text/plain or application/json',
          body: 'Raw HTML OR { html: "..." }'
        },
        'POST /convert/validate': {
          description: 'Validate Lexical JSON structure',
          body: '{ lexical: LexicalState }'
        },
        'GET /health': 'Health check'
      }
    })
  })

  return router
}
