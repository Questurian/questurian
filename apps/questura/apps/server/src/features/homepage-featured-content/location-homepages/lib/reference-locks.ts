import type { Payload } from 'payload'

import { normalizeHomepageFeaturedRef } from '../../featured-articles/service'
import type { HomepageFeaturedCollection } from '../../featured-articles/types'
import type { LocationHomepageDoc, RawBlock } from '../../resolve-page-blocks/service'

type HomepageReference = {
  homepageId: number | 'main'
  scope: 'draft' | 'published' | 'legacy'
  blockIndex: number
  blockType: string
  slot: number
}

const SCAN_FIELDS = [
  ['draft', 'draftPageBlocks'],
  ['published', 'publishedPageBlocks'],
  ['legacy', 'pageBlocks'],
] as const

function blockRefs(block: RawBlock): Array<{ slot: number; ref: ReturnType<typeof normalizeHomepageFeaturedRef> }> {
  if (!Array.isArray(block.items)) return []
  return block.items.map((item, index) => ({
    slot: index + 1,
    ref: normalizeHomepageFeaturedRef(item),
  }))
}

function collectReferences(
  docs: LocationHomepageDoc[],
  relationTo: HomepageFeaturedCollection,
  id: string | number,
  scopes: ReadonlySet<'draft' | 'published' | 'legacy'>,
): HomepageReference[] {
  const refs: HomepageReference[] = []
  const targetId = String(id)

  for (const doc of docs) {
    for (const [scope, fieldName] of SCAN_FIELDS) {
      if (!scopes.has(scope)) continue

      const blocks = doc[fieldName] as RawBlock[] | undefined
      if (!Array.isArray(blocks)) continue

      blocks.forEach((block, blockIndex) => {
        for (const item of blockRefs(block)) {
          if (item.ref?.relationTo === relationTo && String(item.ref.id) === targetId) {
            refs.push({
              homepageId: doc.id,
              scope,
              blockIndex: blockIndex + 1,
              blockType: block.blockType,
              slot: item.slot,
            })
          }
        }
      })
    }
  }

  return refs
}

function describeReferences(refs: HomepageReference[]): string {
  return refs
    .map((ref) =>
      `homepage ${ref.homepageId} ${ref.scope} block ${ref.blockIndex} (${ref.blockType}) slot ${ref.slot}`,
    )
    .join('; ')
}

async function loadHomepagesForReferenceScan(payload: Payload): Promise<LocationHomepageDoc[]> {
  const result = await payload.find({
    collection: 'location-homepages',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    select: {
      id: true,
      pageBlocks: true,
      draftPageBlocks: true,
      publishedPageBlocks: true,
    },
  })

  return result.docs as unknown as LocationHomepageDoc[]
}

async function loadMainHomepageForReferenceScan(payload: Payload): Promise<LocationHomepageDoc[]> {
  try {
    const doc = await payload.findGlobal({
      slug: 'main-homepage',
      depth: 0,
      overrideAccess: true,
    })

    return [{
      id: 'main' as unknown as number,
      draftPageBlocks: Array.isArray((doc as { draftPageBlocks?: unknown }).draftPageBlocks)
        ? (doc as { draftPageBlocks: RawBlock[] }).draftPageBlocks
        : [],
      publishedPageBlocks: Array.isArray((doc as { publishedPageBlocks?: unknown }).publishedPageBlocks)
        ? (doc as { publishedPageBlocks: RawBlock[] }).publishedPageBlocks
        : [],
    }]
  } catch {
    return []
  }
}

export async function assertCanDeleteHomepageFeaturedContent(
  payload: Payload,
  relationTo: HomepageFeaturedCollection,
  id: string | number,
): Promise<void> {
  const docs = [
    ...await loadHomepagesForReferenceScan(payload),
    ...await loadMainHomepageForReferenceScan(payload),
  ]
  const refs = collectReferences(
    docs,
    relationTo,
    id,
    new Set(['draft', 'published', 'legacy']),
  )

  if (refs.length > 0) {
    throw new Error(
      `Cannot delete ${relationTo} #${id}; remove it from curated homepages first: ${describeReferences(refs)}.`,
    )
  }
}

export async function assertCanUnpublishHomepageFeaturedContent(
  payload: Payload,
  relationTo: HomepageFeaturedCollection,
  id: string | number,
): Promise<void> {
  const docs = [
    ...await loadHomepagesForReferenceScan(payload),
    ...await loadMainHomepageForReferenceScan(payload),
  ]
  const refs = collectReferences(docs, relationTo, id, new Set(['published', 'legacy']))

  if (refs.length > 0) {
    throw new Error(
      `Cannot unpublish ${relationTo} #${id}; it is used by a published curated homepage: ${describeReferences(refs)}.`,
    )
  }
}
