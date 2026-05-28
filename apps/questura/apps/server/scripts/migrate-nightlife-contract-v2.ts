import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true
    if (normalized === 'false' || normalized === 'no' || normalized === '0') return false
  }
  return null
}

const unwrapLabeledValue = (value: unknown): unknown => {
  const record = asRecord(value)
  if (!record) return value
  if (Object.prototype.hasOwnProperty.call(record, 'value')) return record.value
  return value
}

const getSectionValue = (
  details: UnknownRecord,
  section: 'theSpace' | 'theScene' | 'theDetails',
  key: string
): unknown => {
  const newSchemaSection = asRecord(details[section])
  const oldSchemaDetails = asRecord(details.details)
  const oldSchemaSection = asRecord(oldSchemaDetails?.[section])
  const candidate = newSchemaSection?.[key] ?? oldSchemaSection?.[key]
  return unwrapLabeledValue(candidate)
}

const buildNightlifeDetails = (doc: UnknownRecord): UnknownRecord => {
  const existingDetails = asRecord(doc.nightlifeDetails) ?? {}
  const core = asRecord(existingDetails.core)
  const theDetails = asRecord(existingDetails.theDetails)

  const operationHours =
    asRecord(theDetails?.operationHours)
    ?? asRecord(getSectionValue(existingDetails, 'theDetails', 'operationHours'))
    ?? asRecord(doc.operationHours)
    ?? {}

  return {
    core: {
      name: asString(core?.name) ?? asString(existingDetails.name) ?? asString(doc.title) ?? '',
      clubType: asString(core?.clubType) ?? asString(existingDetails.club_type) ?? asString(doc.type) ?? '',
      priceTier: asString(core?.priceTier) ?? asString(existingDetails.price_tier) ?? '',
      music: asStringArray(core?.music ?? existingDetails.music),
      idealFor: asStringArray(core?.idealFor),
    },
    theSpace: {
      venueType: asString(getSectionValue(existingDetails, 'theSpace', 'venueType')) ?? '',
      venueSize: asString(getSectionValue(existingDetails, 'theSpace', 'venueSize')) ?? '',
      spaceLayout: asStringArray(getSectionValue(existingDetails, 'theSpace', 'spaceLayout')),
      vibe: asStringArray(getSectionValue(existingDetails, 'theSpace', 'vibe')),
      peakHours: asString(getSectionValue(existingDetails, 'theSpace', 'peakHours')) ?? '',
    },
    theScene: {
      musicFormat: asStringArray(getSectionValue(existingDetails, 'theScene', 'musicFormat')),
      touristPresence: asString(getSectionValue(existingDetails, 'theScene', 'touristPresence')) ?? '',
      dressCode: asStringArray(getSectionValue(existingDetails, 'theScene', 'dressCode')),
      energyLevel: asString(getSectionValue(existingDetails, 'theScene', 'energyLevel')) ?? '',
      vipAndBottleService: asString(getSectionValue(existingDetails, 'theScene', 'vipAndBottleService')) ?? '',
      crowdProfile: asString(getSectionValue(existingDetails, 'theScene', 'crowdProfile')) ?? '',
    },
    theDetails: {
      operationHours,
      bookingUrl:
        asString(theDetails?.bookingUrl)
        ?? asString(existingDetails.reserve_url)
        ?? asString(getSectionValue(existingDetails, 'theDetails', 'bookingUrl'))
        ?? '',
      daytimeRestaurant:
        asBoolean(theDetails?.daytimeRestaurant)
        ?? asBoolean(existingDetails.daytime_restaurant)
        ?? asBoolean(getSectionValue(existingDetails, 'theDetails', 'daytimeRestaurant'))
        ?? false,
    },
  }
}

const migrateNightlifeContractV2 = async () => {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  console.log(`Starting nightlife contract migration (dryRun=${dryRun})`)

  let page = 1
  let processed = 0
  let updated = 0

  while (true) {
    const result = await payload.find({
      collection: 'nightlife',
      page,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    if (!result.docs.length) break

    for (const rawDoc of result.docs) {
      const doc = rawDoc as unknown as UnknownRecord
      const id = rawDoc.id
      processed += 1

      const nextNightlifeDetails = buildNightlifeDetails(doc)
      const currentNightlifeDetails = asRecord(doc.nightlifeDetails) ?? {}
      const changed = JSON.stringify(currentNightlifeDetails) !== JSON.stringify(nextNightlifeDetails)

      if (!changed) continue

      if (dryRun) {
        console.log(`[DRY RUN] Would update nightlife ${String(id)}`)
        updated += 1
        continue
      }

      await payload.update({
        collection: 'nightlife',
        id,
        data: {
          nightlifeDetails: nextNightlifeDetails,
        },
        overrideAccess: true,
      })

      updated += 1
      console.log(`Updated nightlife ${String(id)}`)
    }

    if (page >= result.totalPages) break
    page += 1
  }

  console.log(`Done. processed=${processed}, updated=${updated}, dryRun=${dryRun}`)
}

migrateNightlifeContractV2().catch((error) => {
  console.error('Nightlife contract migration failed:', error)
  process.exit(1)
})
