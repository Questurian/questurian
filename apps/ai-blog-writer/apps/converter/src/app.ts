import express, { type Express } from 'express'

import { createConversionRouter } from './http/conversion-routes.js'
import { createServiceRouter } from './http/service-routes.js'

export function createApp(): Express {
  const app = express()

  app.use((req, _res, next) => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`
    )
    next()
  })

  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    next()
  })

  app.options('*', (req, res) => {
    console.log(`OPTIONS preflight from: ${req.headers.origin || 'unknown'}`)
    res.sendStatus(200)
  })

  app.use(express.json({ limit: '10mb' }))
  app.use(express.text({ type: 'text/plain', limit: '10mb' }))

  app.use('/convert', createConversionRouter())
  app.use(createServiceRouter())

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Unhandled error:', err)
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  )

  return app
}
