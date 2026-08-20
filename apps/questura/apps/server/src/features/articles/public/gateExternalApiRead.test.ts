import { describe, expect, it } from 'vitest'
import type { CollectionAfterReadHook, PayloadRequest } from 'payload'

import { gateExternalApiRead } from './gateExternalApiRead'

const blocks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ blockType: 'text', content: `block ${i}` }))

type Args = Parameters<CollectionAfterReadHook>[0]

const read = (
  hook: CollectionAfterReadHook,
  doc: Record<string, unknown>,
  req: Partial<PayloadRequest>,
) => hook({ doc, req: req as PayloadRequest } as unknown as Args)

const staff = { id: 1, collection: 'users', role: 'writer' } as unknown as PayloadRequest['user']
const serviceAccount = {
  id: 7,
  collection: 'serviceAccounts',
} as unknown as PayloadRequest['user']

describe('gateExternalApiRead', () => {
  const hook = gateExternalApiRead('articles')

  it('samples a gated article read anonymously over REST', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'REST' })

    expect(doc.contentBlocks).toHaveLength(2)
  })

  it('samples a gated article read over GraphQL', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'GraphQL' })

    expect(doc.contentBlocks).toHaveLength(2)
  })

  it('leaves a free article whole over REST', () => {
    const doc: Record<string, unknown> = { access: 'free', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'REST' })

    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('leaves the body whole for a staff reader, so the admin panel still edits it', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'REST', user: staff })

    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('samples for a non-staff principal that holds a session', () => {
    // A service account is not a person and has no editorial role, so it does
    // not get the paid body just for being authenticated (ADR-0006).
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'REST', user: serviceAccount })

    expect(doc.contentBlocks).toHaveLength(2)
  })

  it('leaves the body whole on the Local API, where entitled members are served', () => {
    // `/api/public/articles/full` reads locally with `overrideAccess: true` and
    // no user. Sampling here would lock a member out of what they paid for.
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'local' })

    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('fails open when a fabricated request carries no API marker', () => {
    // Internal read-modify-write callers would otherwise write a sampled body
    // back over the real one.
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, {})

    expect(doc.contentBlocks).toHaveLength(9)
  })

  it('strips every day of a gated itinerary but keeps top-level lodging', () => {
    const itineraries = gateExternalApiRead('listicle-itineraries')
    const doc: Record<string, unknown> = {
      access: 'member',
      itineraryDays: [{ day: 1 }, { day: 2 }],
      whereStaying: [{ blockType: 'itinerary-where-staying' }],
    }

    read(itineraries, doc, { payloadAPI: 'REST' })

    expect(doc.itineraryDays).toEqual([])
    expect(doc.whereStaying).toHaveLength(1)
  })

  it('does not attach a gate marker on this surface', () => {
    const doc: Record<string, unknown> = { access: 'member', contentBlocks: blocks(9) }

    read(hook, doc, { payloadAPI: 'REST' })

    expect(doc.gate).toBeUndefined()
  })
  it("strips locked prose from a gated item's structured data over REST", () => {
    // Surface parity. `seoSection.structuredData` is free-form JSON emitted
    // whole, and a rule that lands on only one of the two enforcement surfaces
    // is what let anonymous `GET /api/articles` hand over paid bodies until
    // 2026-08-16. The strip lives in `applySampleRule`, so both callers get it.
    const doc: Record<string, unknown> = {
      access: 'member',
      contentBlocks: blocks(9),
      seoSection: {
        structuredData: {
          '@type': 'Article',
          headline: 'Three days in Lima',
          isAccessibleForFree: false,
          articleBody: 'z'.repeat(5000),
        },
      },
    }

    read(hook, doc, { payloadAPI: 'REST' })

    const jsonLd = (doc.seoSection as Record<string, unknown>).structuredData as Record<
      string,
      unknown
    >
    expect(jsonLd.articleBody).toBeUndefined()
    expect(jsonLd.headline).toBe('Three days in Lima')
    expect(jsonLd.isAccessibleForFree).toBe(false)
  })
})
