/**
 * Tour-Agency Stop Inventory Script (ADR 0013)
 *
 * The `itinerary-tour-agency` block is being removed in favor of Tour Picks
 * on attraction stops. Migration is hand-driven: create the Tour in Location
 * Manager, link it to the right attraction, re-pick it as a Tour Pick on the
 * itinerary's attraction stop, delete the manual stop. The block is dropped
 * from the schema only at zero usage.
 *
 * This script reports every listicle-itinerary doc still carrying
 * tour-agency stops, so the hand-migration has a worklist and the removal
 * has a gate.
 *
 * Usage:
 *   npx tsx scripts/inventory-tour-agency-stops.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

type BlockRow = { blockType?: string; title?: string }
type DayRow = { items?: BlockRow[]; whereStaying?: BlockRow[] }

function tourAgencyStops(doc: Record<string, unknown>): BlockRow[] {
  const found: BlockRow[] = []

  const scan = (rows: unknown) => {
    if (!Array.isArray(rows)) return
    for (const row of rows as BlockRow[]) {
      if (row?.blockType === 'itinerary-tour-agency') found.push(row)
    }
  }

  scan(doc.items)
  scan(doc.whereStaying)

  if (Array.isArray(doc.itineraryDays)) {
    for (const day of doc.itineraryDays as DayRow[]) {
      scan(day?.items)
      scan(day?.whereStaying)
    }
  }

  return found
}

async function run() {
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'listicle-itineraries',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  let totalStops = 0
  const affected: Array<{
    id: number | string
    title: string
    status: string
    stops: string[]
  }> = []

  for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
    const stops = tourAgencyStops(doc)
    if (stops.length === 0) continue

    totalStops += stops.length
    affected.push({
      id: doc.id as number | string,
      title: typeof doc.title === 'string' ? doc.title : '(untitled)',
      status: typeof doc.status === 'string' ? doc.status : 'unknown',
      stops: stops.map((stop) => stop.title?.trim() || '(untitled tour)'),
    })
  }

  console.log(`Scanned ${result.totalDocs} listicle-itinerary docs.`)
  console.log(
    `Found ${totalStops} tour-agency stop(s) across ${affected.length} doc(s).\n`,
  )

  for (const doc of affected) {
    console.log(`#${doc.id} [${doc.status}] ${doc.title}`)
    for (const stop of doc.stops) {
      console.log(`  - ${stop}`)
    }
  }

  if (affected.length === 0) {
    console.log(
      'Zero usage — the itinerary-tour-agency block is clear for removal (ADR 0013).',
    )
  }

  process.exit(0)
}

run().catch((error) => {
  console.error('Inventory failed:', error)
  process.exit(1)
})
