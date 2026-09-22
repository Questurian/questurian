import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * The launch corpus's images, served from this machine.
 *
 * Seeded media rows point at `http://127.0.0.1:3190/media/…` rather than at
 * Bunny, so a browser journey loads real `<img>` requests of a known size
 * without a CDN bill or a third-party dependency — and without pretending the
 * byte counts are Bunny's. Every path under `/media/` answers the same small
 * JPEG (width-ladder variants such as `_w640` included), and each response
 * is counted so a capture can report image requests and bytes by destination.
 */

// A 1×1 JPEG. The browser scales it; the byte count is honest about being a fixture.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

export type MediaStats = { requests: number; bytes: number }

export class MediaServer {
  readonly stats: MediaStats = { requests: 0, bytes: 0 }
  private server: Server | null = null

  async listen(port: number): Promise<number> {
    this.server = createServer((req, res) => {
      if (req.url === '/__stats') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(this.stats))
        return
      }
      if (!req.url?.startsWith('/media/')) {
        res.writeHead(404)
        res.end()
        return
      }
      this.stats.requests += 1
      this.stats.bytes += JPEG.length
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': String(JPEG.length),
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      })
      res.end(JPEG)
    })
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve))
    return (this.server!.address() as AddressInfo).port
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

if (process.argv[1]?.endsWith('media-server.ts')) {
  const port = Number(process.argv[2] ?? 3190)
  new MediaServer().listen(port).then((bound) => console.log(`media fixture server on 127.0.0.1:${bound}`))
}
