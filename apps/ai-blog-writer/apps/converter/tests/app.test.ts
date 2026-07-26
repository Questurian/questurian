import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { createApp } from '../src/app.js'

type JsonObject = Record<string, unknown>

async function json(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject
}

async function startServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = createApp().listen(0, '127.0.0.1')

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server
  }
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

test('converter HTTP API preserves its route contracts', async (t) => {
  const { baseUrl, server } = await startServer()
  t.after(() => stopServer(server))

  await t.test('describes the service', async () => {
    const response = await fetch(`${baseUrl}/`)
    const body = await json(response)

    assert.equal(response.status, 200)
    assert.equal(body.name, 'Lexical Converter Service')
    assert.deepEqual(Object.keys(body.endpoints as JsonObject), [
      'POST /convert/markdown',
      'POST /convert/html',
      'POST /convert/validate',
      'GET /health'
    ])
  })

  await t.test('reports health', async () => {
    const response = await fetch(`${baseUrl}/health`)
    const body = await json(response)

    assert.equal(response.status, 200)
    assert.equal(body.status, 'healthy')
    assert.equal(body.service, 'lexical-converter')
    assert.equal(Number.isNaN(Date.parse(body.timestamp as string)), false)
  })

  await t.test('handles CORS preflight before body parsing', async () => {
    const response = await fetch(`${baseUrl}/convert/markdown`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com' }
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal(
      response.headers.get('access-control-allow-methods'),
      'GET, POST, OPTIONS'
    )
  })

  await t.test('converts JSON markdown and returns metadata', async () => {
    const response = await fetch(`${baseUrl}/convert/markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '# Hello' })
    })
    const body = await json(response)
    const metadata = body.metadata as JsonObject

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(metadata.nodeCount, 1)
    assert.equal(metadata.hasContent, true)
    assert.equal(Number.isNaN(Date.parse(metadata.timestamp as string)), false)
  })

  await t.test('converts plain-text markdown', async () => {
    const response = await fetch(`${baseUrl}/convert/markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Plain text'
    })
    const body = await json(response)

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
  })

  await t.test(
    'rejects empty markdown with the established error',
    async () => {
      const response = await fetch(`${baseUrl}/convert/markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: '  ' })
      })

      assert.equal(response.status, 400)
      assert.deepEqual(await json(response), {
        success: false,
        error: 'Markdown content cannot be empty'
      })
    }
  )

  await t.test('converts Lexical state back to markdown', async () => {
    const markdownResponse = await fetch(`${baseUrl}/convert/markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: '## Round trip' })
    })
    const markdownBody = await json(markdownResponse)
    const response = await fetch(`${baseUrl}/convert/lexical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lexical: markdownBody.data })
    })
    const body = await json(response)

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.match(body.markdown as string, /^## Round trip/m)
  })

  await t.test('converts HTML to Lexical state', async () => {
    const response = await fetch(`${baseUrl}/convert/html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: '<p>Hello</p>' })
    })
    const body = await json(response)

    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.equal(typeof body.data, 'object')
  })

  await t.test('validates Lexical state shape', async () => {
    const invalidResponse = await fetch(`${baseUrl}/convert/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lexical: { root: { type: 'document' } } })
    })
    const validResponse = await fetch(`${baseUrl}/convert/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lexical: { root: { type: 'root', children: [] } }
      })
    })

    assert.deepEqual(await json(invalidResponse), {
      valid: false,
      errors: [
        'Root node must have type "root"',
        'Root must have children array'
      ]
    })
    assert.deepEqual(await json(validResponse), { valid: true })
  })
})
